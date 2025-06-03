from flask import Flask, request, render_template, jsonify, send_file
import os, time
from werkzeug.utils import secure_filename
import whisper  # Placeholder for Whisper model
from faster_whisper import WhisperModel
from transformers import pipeline  # Hugging Face for summarization
import soundfile as sf
import librosa, uuid, torch
from transformers import BartTokenizer, BartForConditionalGeneration
from RealtimeSTT import AudioToTextRecorder
import threading

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'outputs'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
recorder = None
transcription_thread = None
# recording_duration = 30  # seconds
stop_flag = threading.Event() # A flag to signal the transcription thread to stop

# Global variable to store the latest real-time transcript
realtime_transcript = ""

transcription_whisper_model = whisper.load_model("base")
faster_whisper_model = WhisperModel("base", device="cpu", compute_type="float32")


# Load models
# transcription_model = whisper.load_model("base")  # Placeholder for Whisper model
# summarizer = pipeline("summarization", model="facebook/bart-large-cnn")  # Placeholder summarizer
model_name = "facebook/bart-large-cnn"
tokenizer = BartTokenizer.from_pretrained(model_name)
model = BartForConditionalGeneration.from_pretrained(model_name).to("cpu")

print('App ready')

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

# Helper functions
def preprocess_audio(filepath, target_sr=16000, chunk_duration=30):
    """
    Preprocess audio by resampling and splitting into chunks.
    """
    audio, sr = librosa.load(filepath, sr=None)  # Load with original sampling rate
    if sr != target_sr:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=target_sr)
        sr = target_sr

    chunk_samples = int(sr * chunk_duration)  # Number of samples per chunk
    audio_chunks = [audio[i:i + chunk_samples] for i in range(0, len(audio), chunk_samples)]

    return audio_chunks, sr

# def generate_transcript(filepath):
    """
    Generate transcript by splitting audio into chunks.
    """
    audio_chunks, sr = preprocess_audio(filepath)
    transcript = ""

    for i, chunk in enumerate(audio_chunks):
        temp_filename = f"temp_chunk_{i}.wav"
        temp_filepath = os.path.join(app.config['UPLOAD_FOLDER'], temp_filename)

        # Save the chunk as a temporary file
        sf.write(temp_filepath, chunk, sr)

        # Transcribe the chunk
        result = transcription_whisper_model.transcribe(temp_filepath)
        transcript += result['text'] + " "

        # Clean up temporary file
        os.remove(temp_filepath)

    return transcript.strip()

# def generate_summary(text):
    summary = summarizer(text, max_length=150, min_length=30, do_sample=False)
    return summary[0]['summary_text']

def generate_transcript(filepath):
    """
    Generate transcript using Whisper model, processing audio in-memory.
    """
    start_time = time.time()
    try:
        result = transcription_whisper_model.transcribe(filepath)
        end_time = time.time()
        transcription_time = end_time - start_time
        return result["text"], transcription_time
    except Exception as e:
        return f"Error during Whisper transcription: {e}"


def generate_transcript_faster_whisper(audio_filepath):
    """Generates transcript using the faster-whisper model."""
    start_time = time.time()
    try:
        segments, info = faster_whisper_model.transcribe(audio_filepath, beam_size=5)
        full_transcript = ""
        for segment in segments:
            full_transcript += segment.text + " "
        end_time = time.time()
        transcription_time = end_time - start_time
        return full_transcript.strip(), transcription_time
    except Exception as e:
        return f"Error during faster-whisper transcription: {e}"
    


def split_text_into_chunks(text, max_tokens, tokenizer):
    """
    Splits text into chunks that fit within the model's token limit.
    """
    tokens = tokenizer.tokenize(text)
    chunks = []
    for i in range(0, len(tokens), max_tokens):
        chunk = tokens[i:i + max_tokens]
        chunks.append(tokenizer.convert_tokens_to_string(chunk))
    return chunks

def summarize_chunk(chunk, max_length=500, min_length=100):
    """
    Summarizes a chunk of text using the BART model.
    """
    # Combine system input and user input into a prompt
    # prompt = f"{system_input}\n\nUser Input: {chunk}"

    # Tokenize the input
    inputs = tokenizer(chunk, return_tensors="pt", max_length=1024, truncation=True).to("cpu")

    # Generate the summary
    outputs = model.generate(
        inputs["input_ids"],
        max_length=max_length,
        min_length=min_length,
        length_penalty=2.0,
        num_beams=4,
        early_stopping=True
    )

    # Decode and return the summary
    summary = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return summary

def summarize_long_text(text, max_chunk_tokens=1024, hierarchical_pass=True):
    """
    Splits long text into chunks, summarizes each chunk, and optionally combines 
    chunk summaries into a final coherent summary.
    """
    # Ensure max_chunk_tokens is an integer
    # if not isinstance(max_chunk_tokens, int):
    #     max_chunk_tokens = int(max_chunk_tokens)

    # Step 1: Split text into manageable chunks
    chunks = split_text_into_chunks(text, max_chunk_tokens, tokenizer)
    chunk_summaries = []

    # Step 2: Summarize each chunk
    for i, chunk in enumerate(chunks):
        print(f"Processing chunk {i+1}/{len(chunks)}...")
        summary = summarize_chunk(chunk)
        chunk_summaries.append(summary)

    # Step 3: Combine chunk summaries and optionally summarize them again
    combined_summary = " ".join(chunk_summaries)
    if hierarchical_pass:
        print("Running a final pass for coherence...")
        combined_summary = summarize_chunk(combined_summary, max_length=300, min_length=100)

    return combined_summary




def process_text(text):
    global realtime_transcript
    print(f"Realtime Transcription: {text}")
    # Append or update the global transcript
    realtime_transcript += text + "\n"

def start_realtime_transcription_loop():
    global recorder
    global transcription_thread
    try:
        recorder = AudioToTextRecorder()
        # Loop indefinitely until the stop_flag is set
        while not stop_flag.is_set():
            recorder.text(process_text)
            # Add a small sleep to prevent busy-waiting if recorder.text() is very fast
            # and doesn't yield control, though typically it will block until text is available.
            time.sleep(0.1)
        print("Real-time transcription stopped by API request.")
    except Exception as e:
        print(f"Error in realtime transcription: {e}")
    finally:
        # Ensure resources are cleaned up whether stopped by API or error
        if recorder:
            recorder.stop()
        recorder = None
        transcription_thread = None
        stop_flag.clear() # Clear the flag for the next run

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

@app.route('/get_realtime_transcript', methods=['GET'])
def get_realtime_transcript():
    global realtime_transcript
    return jsonify({"transcript": realtime_transcript})

if __name__ == '__main__':
    app.run(debug=True)
