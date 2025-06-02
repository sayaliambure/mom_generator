from flask import Flask, request, render_template, jsonify, send_file
import os
from werkzeug.utils import secure_filename
import whisper  # Placeholder for Whisper model
from transformers import pipeline  # Hugging Face for summarization
import time
import soundfile as sf
import librosa
import uuid
import torch
from transformers import BartTokenizer, BartForConditionalGeneration

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'outputs'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Load models
transcription_model = whisper.load_model("base")  # Placeholder for Whisper model
# summarizer = pipeline("summarization", model="facebook/bart-large-cnn")  # Placeholder summarizer
model_name = "facebook/bart-large-cnn"
tokenizer = BartTokenizer.from_pretrained(model_name)
model = BartForConditionalGeneration.from_pretrained(model_name).to("cpu")

@app.route('/')
def index():
    print('root route opened')
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
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
    transcript = generate_transcript(filepath)
    print('generated transcript !!')

    # Save transcript to file
    transcript_filename = f"transcript_{uuid.uuid4()}.txt"
    # transcript_filename = f"transcript_{os.path.splitext(filename)[0]}.txt"
    transcript_filepath = os.path.join(OUTPUT_FOLDER, transcript_filename)
    with open(transcript_filepath, 'w', encoding='utf-8') as f:
        f.write(transcript)
    print("written and saved transcript file")
    return jsonify({"transcript": transcript, "transcript_file": transcript_filename})

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
        result = transcription_model.transcribe(temp_filepath)
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
    result = transcription_model.transcribe(filepath)
    return result['text']

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


if __name__ == '__main__':
    app.run(debug=True)
