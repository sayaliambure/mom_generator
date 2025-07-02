import time, os, tempfile
import numpy as np
import librosa
import soundfile as sf
from pydub import AudioSegment
from resemblyzer import VoiceEncoder, preprocess_wav
import requests, shutil
import torch
device = torch.device("cpu")
PROCESSED_UPLOAD_FOLDER = 'processed_uploads'

ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")
HEADERS = {
    "authorization": ASSEMBLYAI_API_KEY,
    "content-type": "application/json"
}
UPLOAD_HEADERS = {
    "authorization": ASSEMBLYAI_API_KEY,
}

encoder = VoiceEncoder()
# Load known voice samples
def load_known_embeddings(voice_sample_dir="voice_samples"):
    known_embeddings = {}
    for file in os.listdir(voice_sample_dir):
        if file.endswith(".wav"):
            name = os.path.splitext(file)[0]
            wav = preprocess_wav(os.path.join(voice_sample_dir, file))
            known_embeddings[name] = encoder.embed_utterance(wav)
    return known_embeddings

known_embeddings = load_known_embeddings()

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


def upload_to_assemblyai(audio_path):
    with open(audio_path, 'rb') as f:
        response = requests.post(
            'https://api.assemblyai.com/v2/upload',
            headers=UPLOAD_HEADERS,
            data=f
        )
    response.raise_for_status()
    return response.json()['upload_url']


def request_transcription(audio_url):
    json_data = {
        "audio_url": audio_url,
        "speaker_labels": True,
        "auto_chapters": False,
        "punctuate": True,
        "format_text": True
    }
    response = requests.post(
        "https://api.assemblyai.com/v2/transcript",
        headers=HEADERS,
        json=json_data
    )
    response.raise_for_status()
    return response.json()['id']


def get_transcription_result(transcript_id):
    polling_endpoint = f"https://api.assemblyai.com/v2/transcript/{transcript_id}"

    while True:
        response = requests.get(polling_endpoint, headers=HEADERS)
        result = response.json()

        if result['status'] == 'completed':
            return result
        elif result['status'] == 'error':
            print(f"Transcription error: {result.get('error')}")
            return None
        else:
            time.sleep(3)


def convert_to_wav_if_mp3(input_filepath):
    """Converts input audio to WAV if it's not already, or returns original path."""
    if not input_filepath.lower().endswith('.wav'):
        print(f"Converting {input_filepath} to WAV...")
        audio = AudioSegment.from_file(input_filepath)
        # Create a temporary file for the WAV output
        temp_wav_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
        audio.export(temp_wav_file, format="wav")
        print(f"Conversion complete. WAV file at: {temp_wav_file}")
        return temp_wav_file
    return input_filepath


def prepare_audio(filepath):
    # Convert to WAV if needed
    processed_audio = convert_to_wav_if_mp3(filepath)

    # Copy to a safe location (e.g., "processed_audio/")
    os.makedirs(PROCESSED_UPLOAD_FOLDER, exist_ok=True)
    copied_path = os.path.join(PROCESSED_UPLOAD_FOLDER, os.path.basename(processed_audio))
    shutil.copy(processed_audio, copied_path)

    return copied_path


# Identifies speakers without names
def diarize_and_transcribe(filepath):
    print('===>>>diarize_and_transcribe called')
    start_time = time.time()

    copied_audio_file = prepare_audio(filepath)
    upload_url = upload_to_assemblyai(copied_audio_file)
    transcript_id = request_transcription(upload_url)
    result = get_transcription_result(transcript_id)

    if not result or result.get("status") != "completed":
        raise RuntimeError("Transcription failed or did not complete successfully.")

    speaker_transcripts = []
    for utterance in result.get("utterances", []):
        speaker_transcripts.append({
            "speaker": utterance["speaker"],
            "start": utterance["start"] / 1000.0,  # ms to seconds
            "end": utterance["end"] / 1000.0,
            "text": utterance["text"].strip()
        })

    end_time = time.time()
    transcription_time = end_time - start_time
    return speaker_transcripts, transcription_time



# Recognises speakers with names in the meeting
def speaker_rec_and_transcribe(filepath):
    print('===>>>speaker_rec_and_transcribe called')
    start_time = time.time()
    
    copied_audio_file = prepare_audio(filepath)

    # Upload audio to AssemblyAI
    upload_url = upload_to_assemblyai(copied_audio_file)

    # Request transcription with speaker diarization
    transcript_id = request_transcription(upload_url)

    # Poll for result
    transcript_json = get_transcription_result(transcript_id)

    print("Transcription + Diarization complete")

    segments = transcript_json.get("utterances", [])

    # Step 2: Speaker recognition
    known_embeddings = load_known_embeddings()  # Reload every time
    speaker_transcripts = []

    for seg in segments:
        seg_start = seg["start"] / 1000  # Convert ms to sec
        seg_end = seg["end"] / 1000
        seg_text = seg["text"].strip()
        speaker_label = seg["speaker"]

        # Extract audio for the segment
        audio = AudioSegment.from_file(copied_audio_file)
        segment = audio[seg_start * 1000: seg_end * 1000]
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_audio_file:
            segment.export(temp_audio_file.name, format="wav")
            temp_audio_path = temp_audio_file.name

        # Speaker recognition
        try:
            wav = preprocess_wav(temp_audio_path)
            segment_embedding = encoder.embed_utterance(wav)

            best_match = None
            best_score = float('-inf')
            for name, known_emb in known_embeddings.items():
                score = np.inner(segment_embedding, known_emb)
                if score > best_score:
                    best_score = score
                    best_match = name

            speaker_name = best_match if best_match else speaker_label

        except Exception as e:
            speaker_name = f"unknown ({e})"

        speaker_transcripts.append({
            "speaker": speaker_name,
            "start": seg_start,
            "end": seg_end,
            "text": seg_text
        })

        os.remove(temp_audio_path)

    end_time = time.time()
    transcription_time = end_time - start_time
    return speaker_transcripts, transcription_time
