import time, requests
import librosa
import whisper
import soundfile as sf
from faster_whisper import WhisperModel
from transformers import pipeline

import os
from dotenv import load_dotenv

load_dotenv()

HUGGINGFACE_API_TOKEN = os.getenv("HUGGINGFACE_API_TOKEN")
HF_MODEL = "openai/whisper-base"
API_URL = f"https://huggingface.co/openai/whisper-base"
HEADERS = {"Authorization": f"Bearer {HUGGINGFACE_API_TOKEN}"}


recorder = None
transcription_thread = None
transcription_whisper_model = whisper.load_model("base")
faster_whisper_model = WhisperModel("base", device="cpu", compute_type="float32")

asr_pipeline = pipeline("automatic-speech-recognition", model="openai/whisper-base")


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


def generate_transcript(filepath):
    """
    Uses model running on local
    Generate transcript using Whisper model, processing audio in-memory.
    """
    start_time = time.time()
    try:
        result = transcription_whisper_model.transcribe(filepath)
        end_time = time.time()
        transcription_time = end_time - start_time
        return result["text"], transcription_time
    except Exception as e:
        return f"Error during Whisper transcription: {e}", 0


def generate_transcript(audio_file):
    start_time = time.time()
    try:
        result = asr_pipeline(audio_file)
        end_time = time.time()
        transcription_time = end_time - start_time
        return result["text"], f"⏱️ Transcribed in {transcription_time:.2f} seconds"
    except Exception as e:
        return f"❌ Error during Whisper transcription: {e}", ""


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
    

def generate_transcript_hf(filepath):
    """
    Generate transcript using Hugging Face Whisper API (cloud).
    """
    start_time = time.time()
    
    try:
        with open(filepath, "rb") as audio_file:
            response = requests.post(API_URL, headers=HEADERS, files={"file": audio_file})

        if response.status_code != 200:
            print("API Error:", response.status_code, response.text)
            return f"Error: {response.text}", 0

        text = response.json().get("text", "")
        end_time = time.time()
        transcription_time = end_time - start_time

        return text.strip(), transcription_time

    except Exception as e:
        return f"Error during HF Whisper transcription: {e}", 0
