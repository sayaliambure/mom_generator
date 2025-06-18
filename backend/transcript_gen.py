import time, os, tempfile
import librosa, whisper
import soundfile as sf
from faster_whisper import WhisperModel
from pyannote.audio import Pipeline
from pydub import AudioSegment

import torch
device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")

HUGGINGFACE_API_TOKEN = os.getenv("HUGGINGFACE_API_TOKEN")
# Initialize the diarization pipeline
diarization_pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1",
                                                use_auth_token=HUGGINGFACE_API_TOKEN)  # replace with your Hugging Face token
diarization_pipeline.to(device)

recorder = None
transcription_thread = None

transcription_whisper_model = whisper.load_model("base")
faster_whisper_model = WhisperModel("base", device="cpu", compute_type="float32")


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


def diarize_and_transcribe(filepath):
    start_time = time.time()
    # Step 1: Diarization
    diarization = diarization_pipeline(filepath)
    print("Diarization complete")

    # Step 2: Load audio for segmentation
    audio = AudioSegment.from_file(filepath)
    
    speaker_transcripts = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segment = audio[turn.start * 1000: turn.end * 1000]  # milliseconds
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_audio_file:
            segment.export(temp_audio_file.name, format="wav")
            temp_audio_path = temp_audio_file.name

        # Step 3: Transcribe the segment using Whisper
        try:
            result = transcription_whisper_model.transcribe(temp_audio_path)
            speaker_transcripts.append({
                "speaker": speaker,
                "start": turn.start,
                "end": turn.end,
                "text": result['text']
            })
        except Exception as e:
            speaker_transcripts.append({
                "speaker": speaker,
                "start": turn.start,
                "end": turn.end,
                "text": f"Error: {e}"
            })

    end_time = time.time()
    transcription_time = end_time - start_time
    return speaker_transcripts, transcription_time



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
    

