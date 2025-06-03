from flask import Flask, request, render_template, jsonify, send_file
import os, uuid
from werkzeug.utils import secure_filename
import threading
from transcript_gen import generate_transcript, generate_transcript_faster_whisper
from real_time_transcript import start_realtime_transcription_loop
from summarizer import summarize_long_text

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'outputs'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

stop_flag = threading.Event() # A flag to signal the transcription thread to stop
recorder = None
transcription_thread = None
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

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    print('file saved successfully')

    # Generate transcript
    print('transcipt being generated...')
    transcript, transcription_time = generate_transcript(filepath)
    print('generated transcript !!')

    # Save transcript to file
    transcript_filename = f"transcript_{uuid.uuid4()}.txt"
    # transcript_filename = f"transcript_{os.path.splitext(filename)[0]}.txt"
    transcript_filepath = os.path.join(OUTPUT_FOLDER, transcript_filename)
    with open(transcript_filepath, 'w', encoding='utf-8') as f:
        f.write(transcript)
    print("written and saved transcript file")
    return jsonify({"transcript": transcript, "transcript_file": transcript_filename, "model": "whisper", "transcription time": transcription_time})


# using faster-whisper model
@app.route('/faster-whisper', methods=['POST'])
def faster_whisper():
    print('upload/faster-whisper route called')
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    print('file saved successfully')

    # Generate transcript using faster-whisper
    print('faster-whisper transcript being generated...')
    transcript, transcription_time = generate_transcript_faster_whisper(filepath)
    print('generated faster-whisper transcript !!')

    # Save transcript to file
    transcript_filename = f"faster_whisper_transcript_{uuid.uuid4()}.txt"
    transcript_filepath = os.path.join(OUTPUT_FOLDER, transcript_filename)
    with open(transcript_filepath, 'w', encoding='utf-8') as f:
        f.write(transcript)
    print("written and saved faster-whisper transcript file")
    return jsonify({"transcript": transcript, "transcript_file": transcript_filename, "model": "faster-whisper", "transcription time": transcription_time})


@app.route('/summarize', methods=['POST'])
def summarize():
    data = request.json
    transcript = data.get("transcript")
    if not transcript:
        return jsonify({"error": "No transcript provided"}), 400

    # Generate summary
    print("summarising your transcript..")
    system_input = "You are a professional assistant who summarizes meeting transcripts into concise bullet points."
    summary = summarize_long_text(transcript)
    print('summary generated!!')

    # Save summary to file
    summary_filename = f"summary_{uuid.uuid4()}.txt"
    summary_filepath = os.path.join(OUTPUT_FOLDER, summary_filename)
    with open(summary_filepath, 'w', encoding='utf-8') as f:
        f.write(summary)

    return jsonify({"summary": summary, "summary_file": summary_filename})

@app.route('/download/<filename>')
def download_file(filename):
    filepath = os.path.join(OUTPUT_FOLDER, filename)
    if os.path.exists(filepath):
        return send_file(filepath, as_attachment=True)
    return jsonify({"error": "File not found"}), 404


@app.route('/start_realtime_transcription', methods=['POST'])
def start_stt():
    global recorder
    global transcription_thread
    if recorder is None and (transcription_thread is None or not transcription_thread.is_alive()):
        stop_flag.clear() # Ensure the flag is clear before starting a new transcription
        transcription_thread = threading.Thread(target=start_realtime_transcription_loop)
        transcription_thread.daemon = True
        transcription_thread.start()
        return jsonify({"message": "Real-time transcription started. Check server console for output."}), 200
    elif recorder is not None or (transcription_thread is not None and transcription_thread.is_alive()):
        return jsonify({"message": "Real-time transcription is already running."}), 200
    else:
        return jsonify({"message": "Real-time transcription could not be started."}), 500

@app.route('/stop_realtime_transcription', methods=['POST'])
def stop_stt():
    global recorder
    global transcription_thread
    if transcription_thread and transcription_thread.is_alive():
        stop_flag.set() # Signal the transcription thread to stop
        # Give the thread a moment to process the stop signal and clean up
        transcription_thread.join(timeout=10) # Wait for thread to finish (max 10 seconds)
        if transcription_thread.is_alive():
            print("Warning: Transcription thread did not terminate cleanly within timeout.")
            # If it's still alive, it means recorder.stop() or the loop condition
            # didn't break in time. Force clear references.
            recorder = None
            transcription_thread = None
            stop_flag.clear() # Clear the flag for future runs
            return jsonify({"message": "Real-time transcription stop initiated, but thread did not join cleanly."}), 202
        else:
            return jsonify({"message": "Real-time transcription stopped."}), 200
    else:
        return jsonify({"message": "Real-time transcription is not running."}), 200

# @app.route('/get_realtime_transcript', methods=['GET'])
# def get_realtime_transcript():
#     global realtime_transcript
#     return jsonify({"transcript": realtime_transcript})

if __name__ == '__main__':
    app.run(debug=True)
