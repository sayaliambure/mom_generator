import time
import librosa
import whisper
import soundfile as sf
from faster_whisper import WhisperModel

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
    

