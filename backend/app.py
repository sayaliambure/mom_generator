from flask import Flask, request, render_template, jsonify, send_file, send_from_directory
import os, uuid
import soundfile as sf
from werkzeug.utils import secure_filename
import threading
from transcript_gen import diarize_and_transcribe, speaker_rec_and_transcribe
from llm_generate import query_nvidia_model, query_nvidia_scoring_model
from chat import build_meeting_index, query_meeting_qa
from custom_transcriber import CustomTranscriber
from datetime import datetime
from flask_cors import CORS
import torch
import subprocess
# print('GPU on mac? ', torch.backends.mps.is_available())  # True = Apple GPU available


app = Flask(__name__)
# CORS(app, origins=['http://localhost:3000'])
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
PROCESSED_UPLOAD_FOLDER = 'processed_uploads'
OUTPUT_FOLDER = 'outputs'
LIVE_TRANSCRIPT_FOLDER = 'live_transcripts'
LIVE_RECORDED_MEET_FOLDER = 'live_recorded_meet_audio'
VOICE_SAMPLES = 'voice_samples'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(PROCESSED_UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(LIVE_TRANSCRIPT_FOLDER, exist_ok=True)
os.makedirs(LIVE_RECORDED_MEET_FOLDER, exist_ok=True)
os.makedirs(VOICE_SAMPLES, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

stop_flag = threading.Event() # A flag to signal the transcription thread to stop
transcription_thread = None
transcriber = None
print('App started')


@app.route('/')
def index():
    print('root route opened')
    return render_template('index.html')

# using whisper model
@app.route('/transcribe', methods=['POST'])
def transcribe():
    print('upload route called')
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    # Determine save folder based on mode
    mode = request.form.get('mode', 'upload')
    if mode == 'record':
        save_folder = LIVE_RECORDED_MEET_FOLDER
    else:
        save_folder = app.config['UPLOAD_FOLDER']

    filename = secure_filename(file.filename)
    filepath = os.path.join(save_folder, filename)
    file.save(filepath)
    print(f'file saved successfully to {filepath}')

    # If file is .webm, convert to .wav
    if filename.endswith('.webm'):
        wav_path = filepath.rsplit('.', 1)[0] + '.wav'
        try:
            subprocess.run(['ffmpeg', '-y', '-i', filepath, wav_path], check=True)
            print(f'Converted {filepath} to {wav_path}')
            filepath = wav_path  # Use the wav file for transcription
        except Exception as e:
            return jsonify({"error": f"Failed to convert webm to wav: {e}"}), 500

    # Check if speaker identification is requested
    speaker_identification = request.form.get('speaker_identification') == 'true'

    if speaker_identification:
        attendee_names = request.form.getlist('attendee_names')
        samples = request.files.getlist('samples')
        if len(attendee_names) != len(samples):
            return jsonify({"error": "Mismatch in number of names and samples"}), 400
        for name, sample in zip(attendee_names, samples):
            sample_filename = secure_filename(f"{name}.wav")
            sample_path = os.path.join(VOICE_SAMPLES, sample_filename)
            sample.save(sample_path)
            print(f"Saved sample for {name} at {sample_path}")
        speaker_transcripts, transcription_time = speaker_rec_and_transcribe(filepath)

    else:
        speaker_transcripts, transcription_time = diarize_and_transcribe(filepath)

    combined_transcript = "\n".join(
        [f"[{seg['speaker']} - {seg['start']:.2f}s to {seg['end']:.2f}s]: {seg['text']}" for seg in speaker_transcripts])

    return jsonify({
        "transcript": combined_transcript,
        "speaker_segments": speaker_transcripts,
        "model": "whisper + diarization",
        "transcription time": transcription_time
    })


# using faster-whisper model
# @app.route('/faster-whisper', methods=['POST'])
# def faster_whisper():
#     print('upload/faster-whisper route called')
#     if 'file' not in request.files:
#         return jsonify({"error": "No file uploaded"}), 400
#     file = request.files['file']
#     if file.filename == '':
#         return jsonify({"error": "No file selected"}), 400

#     filename = secure_filename(file.filename)
#     filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
#     file.save(filepath)
#     print('file saved successfully')

#     # Generate transcript using faster-whisper
#     print('faster-whisper transcript being generated...')
#     transcript, transcription_time = generate_transcript_faster_whisper(filepath)
#     print('generated faster-whisper transcript !!')

#     # Save transcript to file
#     transcript_filename = f"faster_whisper_transcript_{uuid.uuid4()}.txt"
#     transcript_filepath = os.path.join(OUTPUT_FOLDER, transcript_filename)
#     with open(transcript_filepath, 'w', encoding='utf-8') as f:
#         f.write(transcript)
#     print("written and saved faster-whisper transcript file")
#     return jsonify({"transcript": transcript, "transcript_file": transcript_filename, "model": "faster-whisper", "transcription time": transcription_time})


@app.route('/summarize', methods=['POST'])
def summarize():
    data = request.json
    transcript = data.get("transcript")
    if not transcript:
        return jsonify({"error": "No transcript provided"}), 400
    # Generate summary
    print("summarising your transcript..")
    task_prompt = """You are an AI assistant designed to process meeting transcripts and generate clear, concise summaries that can be shared with team members or stakeholders. 
    The goal is to highlight key discussion points, decisions made, and important context without including unnecessary dialogue or filler content.
    Please read the entire transcript carefully and generate a structured, high-quality summary with the following guidelines: 
    Instructions:
    1. Concise & Clear: Use professional and simple language suitable for internal communication.
    2. Avoid:
    - Word-for-word repetition from the transcript
    - Including non-meaningful small talk
    - Naming participants unless relevant to the summary
    3. Assume Context: If roles (e.g., PM, developer) or project names are mentioned, interpret them accordingly without over-explaining.
    
    Below is the transcript of a meeting: """

    summary = query_nvidia_model(transcript, task_prompt)
    if summary is None:
        return jsonify({"error": "Failed to get summary from NVIDIA API"}), 500

    return jsonify({"summary": summary})



@app.route('/action-items', methods=['POST'])
def action_items():
    data = request.json
    transcript = data.get("transcript")
    if not transcript:
        return jsonify({"error": "No transcript provided"}), 400
    print("Extracting action items...")
    task_prompt = """You are an AI assistant that analyzes meeting transcripts and extracts clear, concise, actionable items(task or decision) from the meeting. 
    Your task is to identify all responsibilities, next steps, or tasks discussed in the meeting, even if they were informally mentioned.
    Please read the entire transcript carefully and generate a list of Action Items based on what was discussed.
    Instructions:
    1. Clarity: Each action item should be clear and specific, even if the task was mentioned casually or indirectly.
    4. Output format: Use bullet points with each bullet being a specific task or decision.
    5. Avoid:
    - Repeating general discussion points.
    - Listing vague or unconfirmed suggestions.
    
    Below is the transcript of a meeting: """
    actions = query_nvidia_model(transcript, task_prompt)
    if actions is None:
        return jsonify({"error": "Failed to get action items from NVIDIA API"}), 500

    return jsonify({"action_items": actions})


@app.route('/minutes-of-meeting', methods=['POST'])
def minutes_of_meeting():
    data = request.json
    transcript = data.get("transcript")
    agenda = data.get("agenda")
    if not transcript:
        return jsonify({"error": "No transcript provided"}), 400
    print("Generating minutes of meeting...")
    task_prompt = """You are an AI assistant responsible for generating formal "Minutes of Meeting (MoM)" from raw meeting transcripts. The minutes should capture all critical information in a structured, professional format suitable for sharing with internal and external stakeholders.
    Your output must follow official meeting minutes formatting and provide a clear record of what happened, who attended, what was discussed, and the decisions and action items that resulted.
    ---
    Instructions:
    Generate the Minutes of Meeting from the transcript below, using the following format and guidelines:
    ---
    ###Format for Minutes of Meeting:
    *Meeting Title*: <Use a title based on the transcript, or default to “Project Status Meeting”>  
    *Date*: <Infer or leave blank if not available>  
    *Time*: <Optional - include if present in transcript>  
    *Attendees*: <List names/roles if mentioned; otherwise mark as “Not Specified”>  
    *Prepared By*: AI Assistant
    ---
    ### Agenda:  
    <Write 1-5 bullet points summarizing the key topics intended for discussion>
    ---
    ### Discussion Summary:
    <Summary of key discussion>  
    ---
    ### Decisions Made:
    - <Decision 1>
    - <Decision 2>
    ---
    ### Action Items:
    - <Action Item 1>
    - <Action Item 2>
    ---

    Below is the transcript of a meeting: 
    """
    mom = query_nvidia_scoring_model(transcript, agenda, task_prompt)
    if mom is None:
        return jsonify({"error": "Failed to get minutes of meeting from NVIDIA API"}), 500

    return jsonify({"minutes_of_meeting": mom})


@app.route('/sentiment', methods=['POST'])
def sentiment():
    data = request.json
    transcript = data.get("transcript")
    if not transcript:
        return jsonify({"error": "No transcript provided"}), 400
    print("Generating Sentiment Analysis...")
    task_prompt = """You are an AI assistant tasked with analyzing a meeting transcript and performing sentiment analysis. 
    Your goal is to assess the overall tone and emotional content of the conversation, identify individual sentiments where appropriate, and highlight moments of tension, enthusiasm, disagreement, or positive alignment.
    ---
    ### Instructions:
    Analyze the meeting transcript and output the sentiment insights in the following structured format:
    ---
    ### Sentiment Analysis Output:
    **1. Overall Sentiment**:  
    - <Summary of the general mood of the meeting: Positive / Neutral / Negative>  
    - <1-2 lines explaining why>

    **2. Sentiment by Topic**:  
    List key topics discussed and the sentiment expressed around each topic.
    Example:
    | Topic                       | Sentiment  | Reasoning / Evidence from Transcript               |
    |-----------------------------|------------|----------------------------------------------------|
    | Project deadline extension  | Negative   | Team expressed frustration over delays             |
    | Product demo feedback       | Positive   | Participants were pleased with the client's input  |
    | Budget concerns             | Neutral    | Discussed constructively, without strong emotions  |

    **3. Sentiment by Speaker (if applicable)**:  
    If speakers are identified in the transcript, summarize the emotional tone of their contributions.
    Example:
    | Speaker        | Sentiment  | Notes                                               |
    |----------------|------------|-----------------------------------------------------|
    | Alice (PM)     | Neutral    | Focused on timelines and task tracking              |
    | Bob (Dev)     | Negative   | Expressed concern about workload and deadlines      |

    ---
    ### Guidelines:
    - Be objective and context-aware; do not misinterpret sarcasm or polite disagreement.
    - If the tone shifts during the meeting, capture those shifts clearly.
    - Assume a business meeting setting with professional language.
    ---

    Below is the transcript of a meeting: 
    """
    sentiment = query_nvidia_model(transcript, task_prompt)
    if sentiment is None:
        return jsonify({"error": "Failed to get sentiment analysis from NVIDIA API"}), 500

    return jsonify({"sentiment": sentiment})


@app.route('/scoring-mechanism', methods=['POST'])
def scoring_mechanism():
    data = request.json
    transcript = data.get("transcript")
    agenda = data.get("agenda")
    if not transcript or not agenda:
        return jsonify({"error": "No transcript or agenda provided"}), 400
    print("Generating Meeting Score...")
    task_prompt = """You are an AI assistant that evaluates the quality and focus of meetings based on how well they align with the stated agenda. 
    Your job is to analyze a meeting transcript and provide a "Meeting Score" between 0 and 10, along with a breakdown and justification.
    ---
    ### Instructions:
    Using the transcript and agenda provided below, evaluate the meeting on the following criteria:
    ### Scoring Criteria (Total: 10 Points):
    1. **Agenda Coverage** (4 points)  
    - Were all agenda topics addressed?  
    - Were they discussed in reasonable depth?
    2. **Focus and Relevance** (2 points)  
    - Did the discussion stay on topic?  
    - Was there minimal unrelated chatter or tangents?
    3. **Time Management & Flow** (2 points)  
    - Was the time spent proportionate across topics?  
    - Was there a logical flow to the discussion?
    4. **Clarity of Outcomes** (2 points)  
    - Were conclusions or next steps clearly stated for each agenda item?
    ---

    ### Output Format:
    **Meeting Score**: X / 10  
    **Verdict**: <One-liner summary, e.g., “Mostly aligned with agenda, but had off-topic digressions.”>
    **Breakdown**:  
    - **Agenda Coverage**: X/4 - <Brief explanation>  
    - **Focus and Relevance**: X/2 - <Brief explanation>  
    - **Time Management & Flow**: X/2 - <Brief explanation>  
    - **Clarity of Outcomes**: X/2 - <Brief explanation>
    **Suggestions for Improvement**:  
    - <Actionable tips to improve agenda alignment in future meetings>
    ---

    Below is the transcript of a meeting: 
    """
    score = query_nvidia_scoring_model(transcript, agenda, task_prompt)
    if score is None:
        return jsonify({"error": "Failed to get score from NVIDIA API"}), 500

    return jsonify({"score": score})


@app.route('/download/<filename>')
def download_file(filename):
    filepath = os.path.join(OUTPUT_FOLDER, filename)
    if os.path.exists(filepath):
        return send_file(filepath, as_attachment=True, mimetype='application/pdf')
    return jsonify({"error": "File not found"}), 404




@app.route('/audio/<filename>')
def serve_audio(filename):
    return send_from_directory("audio_folder", filename)

@app.route('/live_transcripts/<path:filename>')
def serve_live_transcript_file(filename):
    return send_from_directory('live_transcripts', filename)

@app.route('/live_recored_meet_audio/<path:filename>')
def serve_live_audio_file(filename):
    return send_from_directory('live_recored_meet_audio', filename)


@app.route('/save_audio_recording', methods=['POST'])
def save_audio_recording():
    if 'audio_data' not in request.files:
        return jsonify({'error': 'No audio file uploaded'}), 400
    
    audio_file = request.files['audio_data']
    
    if audio_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    # Generate a unique filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"recording_{timestamp}.webm"
    save_path = os.path.join('live_recored_meet_audio', filename)
    
    audio_file.save(save_path)
    
    return jsonify({
        'message': 'Audio saved successfully',
        'filename': filename,
        'audio_url': f'/live_recored_meet_audio/{filename}'
    })


@app.route('/start_realtime_transcription', methods=['POST'])
def start_transcription():
    global transcriber
    try:
        if transcriber is None or transcriber.stop_flag.is_set():
            transcriber = CustomTranscriber()
            transcriber.start('live_recored_meet_audio')
            return jsonify({
                "status": "success",
                "message": "Real-time transcription started",
                "model": "faster-whisper"
            }), 200
        return jsonify({
            "status": "error",
            "message": "Transcription already running"
        }), 400
    except Exception as e:
        print(f"Error starting transcription: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500



@app.route('/stop_realtime_transcription', methods=['POST'])
def stop_transcription():
    global transcriber
    try:
        if transcriber and not transcriber.stop_flag.is_set():
            results = transcriber.stop()
            
            # Verify files
            audio_exists = os.path.exists(results["audio_file"])
            transcript_exists = os.path.exists(results["transcript_file"])
            
            # Prepare response
            response = {
                "status": "success",
                "transcript": results["transcript"],
                "audio_path": f"/live_recored_meet_audio/{os.path.basename(results['audio_file'])}",
                "transcript_path": f"/live_transcripts/{os.path.basename(results['transcript_file'])}",
                "audio_duration": get_audio_duration(results["audio_file"])
            }
            
            return jsonify(response), 200
        
        return jsonify({"status": "error", "message": "No active transcription"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

def get_audio_duration(filepath):
    """Get duration in seconds of audio file"""
    try:
        with sf.SoundFile(filepath) as f:
            return len(f) / f.samplerate
    except:
        return 0


# temp audio recorded file saved at location and found using this api
@app.route('/transcripts/<path:filename>')
def serve_audio_file(filename):
    return send_from_directory('transcripts', filename)



@app.route('/get_live_transcript', methods=['GET'])
def get_live_transcript():
    global transcriber
    if transcriber is None:
        return jsonify({
            "status": "error",
            "message": "Transcriber not initialized",
            "debug": "Transcriber is None"
        }), 400
        
    if transcriber.stop_flag.is_set():
        return jsonify({
            "status": "error",
            "message": "Transcription stopped",
            "debug": "Stop flag is set"
        }), 400
        
    try:
        transcript = transcriber.get_live_transcript()
        print(f"Current transcript length: {len(transcript)} chars")
        return jsonify({
            "status": "success",
            "text": transcript,
            "is_active": True,
            "model": "faster-whisper"
        })
    except Exception as e:
        print(f"Error in get_live_transcript: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e),
            "debug": "Exception occurred"
        }), 500



@app.route('/get_transcript_file', methods=['GET'])
def get_transcript_file():
    if os.path.exists(LIVE_TRANSCRIPT_FOLDER):
        return send_file(LIVE_TRANSCRIPT_FOLDER, mimetype='text/plain', as_attachment=False)
    return jsonify({"message": "Transcript file not found."}), 404



@app.route('/build-index', methods=['POST'])
def build_index_route():
    try:
        build_meeting_index()
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/query', methods=['POST'])
def query_route():
    try:
        body = request.get_json()
        user_query = body.get("query", "")
        if not user_query:
            return jsonify({"error": "Query is required"}), 400

        result = query_meeting_qa(user_query)
        return jsonify(result), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500



if __name__ == '__main__':
    app.run(debug=True, port=5000)
