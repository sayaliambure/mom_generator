import time, os, tempfile, math
import numpy as np
import librosa, whisper
import soundfile as sf
from pydub import AudioSegment
from faster_whisper import WhisperModel
from pyannote.audio import Pipeline
from pydub import AudioSegment
from resemblyzer import VoiceEncoder, preprocess_wav
import openai

import torch
device = torch.device("cpu")

HUGGINGFACE_API_TOKEN = os.getenv("HUGGINGFACE_API_TOKEN")
# Initialize the diarization pipeline
diarization_pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1",
                                                use_auth_token=HUGGINGFACE_API_TOKEN)  # replace with your Hugging Face token
diarization_pipeline.to(device)

openai.api_key = os.getenv("GROQ_API_KEY")
openai.api_base = "https://api.groq.com/openai/v1"  # Groq's endpoint


# transcription_whisper_model = whisper.load_model("base")
# faster_whisper_model = WhisperModel("base", device="cpu", compute_type="float32")

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


def split_audio(filepath, chunk_length_ms=5*60*1000):  # 5 minutes
    audio = AudioSegment.from_file(filepath)
    chunks = []
    for i in range(0, len(audio), chunk_length_ms):
        chunk = audio[i:i+chunk_length_ms]
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            chunk.export(f.name, format="wav")
            chunks.append(f.name)
    return chunks



def transcribe_with_groq(audio_file_path):
    with open(audio_file_path, "rb") as audio_file:
        response = openai.Audio.transcribe(
            model="whisper-large-v3",
            file=audio_file,
            response_format="verbose_json",  # to get timestamps
            # timestamp_granularities=["segment"]  # get segment-level timing
        )
    print('RESPONSE FORM GROQ!!: ', response)
    return response


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

# Identifies speakers without names
def diarize_and_transcribe(filepath):
    print('===>>>diarize_and_transcribe called')
    start_time = time.time()

    processed_audio_file = convert_to_wav_if_mp3(filepath)

    # Step 1: Transcribe in chunks using Whisper (Groq)
    chunks = split_audio(processed_audio_file, chunk_length_ms=2*60*1000)  # 5 min chunks
    segments = []
    for chunk_path in chunks:
        try:
            chunk_transcript = transcribe_with_groq(chunk_path)
            chunk_segments = chunk_transcript.get("segments", [])
            segments.extend(chunk_segments)
        except Exception as e:
            print(f"Error transcribing chunk {chunk_path}: {e}")
    segments.sort(key=lambda x: x["start"])  # ensure segments are ordered
    print("Transcription done")

    # Step 2: Diarize
    diarization = diarization_pipeline(processed_audio_file)
    print("Diarization complete")


    # Step 3: Match transcript segments with speakers
    speaker_transcripts = []
    for seg in segments:
        seg_start = seg["start"]
        seg_end = seg["end"]
        seg_text = seg["text"].strip()

        if not seg_text:  # skip silent or empty transcriptions
            continue

        # Find the speaker whose segment overlaps most
        matched_speaker = "unknown"
        max_overlap = 0
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            overlap_start = max(seg_start, turn.start)
            overlap_end = min(seg_end, turn.end)
            overlap = max(0, overlap_end - overlap_start)
            if overlap > max_overlap:
                max_overlap = overlap
                matched_speaker = speaker


        speaker_transcripts.append({
            "speaker": matched_speaker,
            "start": seg_start,
            "end": seg_end,
            "text": seg_text
        })


    end_time = time.time()
    transcription_time = end_time - start_time
    return speaker_transcripts, transcription_time



# Recognises speakers with names in the meeting
def speaker_rec_and_transcribe(filepath):
    print('===>>>speaker_rec_and_transcribe called')
    start_time = time.time()
    # Step 1: Transcribe once using Groq
    transcript = transcribe_with_groq(filepath)
    transcription_segments = transcript.get("segments", [])
    print("Transcription done")

    # Step 2: Diarization
    diarization = diarization_pipeline(filepath)
    print("Diarization complete")
    
    # Step 3: Load audio for segmentation
    audio = AudioSegment.from_file(filepath)
    known_embeddings = load_known_embeddings()  # <--- Now reloads every time
    
    used_segments = set()
    # Step 4: Match diarized segments to transcript and identify speaker
    speaker_transcripts = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segment = audio[turn.start * 1000: turn.end * 1000]  # milliseconds
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_audio_file:
            segment.export(temp_audio_file.name, format="wav")
            temp_audio_path = temp_audio_file.name

        # Find matching transcription segment(s)
        try:
            text = ""
            for idx, ts in enumerate(transcription_segments):
                if idx in used_segments:
                    continue
                ts_start, ts_end = ts["start"], ts["end"]
                overlap = min(turn.end, ts_end) - max(turn.start, ts_start)
                duration = ts_end - ts_start
                if overlap > 0.3 * duration:  # Use a threshold (30% overlap)
                    segment_text = ts["text"].strip()
                    if segment_text:
                        text += segment_text + " "
                        used_segments.add(idx)

            text = text.strip()
            if not text:
                continue  # Skip this segment if no transcription was matched
             
        except Exception as e:
            text = f"Error: {e}"

        # Step 5: Speaker recognition: match embedding
        wav = preprocess_wav(temp_audio_path)
        segment_embedding = encoder.embed_utterance(wav)

        best_match = None
        best_score = float('-inf')
        for name, known_emb in known_embeddings.items():
            score = np.inner(segment_embedding, known_emb)
            if score > best_score:
                best_score = score
                best_match = name

        speaker_name = best_match if best_match else speaker

        speaker_transcripts.append({
            "speaker": speaker_name,
            "start": turn.start,
            "end": turn.end,
            "text": text
        })

        # Optional: Clean up temp file
        os.remove(temp_audio_path)
    end_time = time.time()
    transcription_time = end_time - start_time
    return speaker_transcripts, transcription_time




# def generate_transcript(filepath):
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


# def generate_transcript_faster_whisper(audio_filepath):
#     """Generates transcript using the faster-whisper model."""
#     start_time = time.time()
#     try:
#         segments, info = faster_whisper_model.transcribe(audio_filepath, beam_size=5)
#         full_transcript = ""
#         for segment in segments:
#             full_transcript += segment.text + " "
#         end_time = time.time()
#         transcription_time = end_time - start_time
#         return full_transcript.strip(), transcription_time
#     except Exception as e:
#         return f"Error during faster-whisper transcription: {e}"
    

