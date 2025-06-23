import time, os
import threading
from RealtimeSTT import AudioToTextRecorder
from queue import Queue
import soundfile as sf  
import sounddevice as sd
import numpy as np

LIVE_TRANSCRIPT_FOLDER = 'live_transcripts'
LIVE_RECORDED_MEET_FOLDER = 'live_recored_meet_audio'




# Global variable to store the latest real-time transcript
# realtime_transcript = ""
# recording_duration = 30  # seconds

# Audio recording parameters
SAMPLE_RATE = 16000
CHANNELS = 1
DTYPE = 'float32'


class AudioRecorder:
    def __init__(self):
        self.audio_buffer = []
        self.is_recording = False
        self.stream = None
        self.lock = threading.Lock()

    def callback(self, indata, frames, time, status):
        """This is called for each audio block from the microphone."""
        if self.is_recording:
            with self.lock:
                self.audio_buffer.append(indata.copy())

    def start(self):
        with self.lock:
            self.audio_buffer = []
            self.is_recording = True
        self.stream = sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype=DTYPE,
            callback=self.callback
        )
        self.stream.start()

    def stop(self):
        self.is_recording = False
        if self.stream:
            self.stream.stop()
            self.stream.close()
        with self.lock:
            return np.concatenate(self.audio_buffer) if self.audio_buffer else np.array([])


# Global variables
audio_recorder = AudioRecorder()
realtime_transcript_queue = Queue()
stop_flag = threading.Event() # A flag to signal the transcription thread to stop
transcription_thread = None
final_transcript = ""
live_transcript_filepath = ""
current_audio_file_path = ""



def process_text(text, file_path):
    print('PROCESS TEXT CALLED!!!')
    global final_transcript
    print(f"Realtime Transcription: {text}")
    realtime_transcript_queue.put(text)
    final_transcript += text + "\n"
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(text + "\n")

def get_realtime_transcript_queue():
    texts = []
    while not realtime_transcript_queue.empty():
        texts.append(realtime_transcript_queue.get())
    return "\n".join(texts)


def start_realtime_transcription_loop():
    global audio_recorder, transcription_thread
    global live_transcript_filepath, final_transcript, current_audio_file_path
   
    # Generate unique filename based on timestamp
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    os.makedirs(LIVE_TRANSCRIPT_FOLDER, exist_ok=True)
    os.makedirs(LIVE_RECORDED_MEET_FOLDER, exist_ok=True)
    live_transcript_filepath = f"{LIVE_TRANSCRIPT_FOLDER}/live_transcript_{timestamp}.txt"
    current_audio_file_path = f"{LIVE_RECORDED_MEET_FOLDER}/recorded_meet_{timestamp}.wav"
    final_transcript = ""

    # Start audio recording
    audio_recorder.start()
    print("Audio recording started...")

    print('live_transcript_filepath ', live_transcript_filepath)
    print('current_audio_file_path ', current_audio_file_path)

    try:
        stt_recorder = AudioToTextRecorder()
        stt_recorder.start() 
        print("Speech-to-text recording started...")
        # Loop indefinitely until the stop_flag is set
        while not stop_flag.is_set():
            try:
                stt_recorder.text(lambda text: process_text(text, live_transcript_filepath))
                time.sleep(0.1)
            except Exception as e:
                print(f"Error during transcription: {e}")
                break

    except Exception as e:
        print(f"Error in realtime transcription: {e}")


    finally:
        print("Stopping recording...")
        # Stop and save audio
        try:
            audio_data = audio_recorder.stop()
            print(f"Audio data length: {len(audio_data) if 'audio_data' in locals() else 'No data'}")
            if audio_data.size > 0:  # Check if we actually got audio data
                sf.write(current_audio_file_path, audio_data, SAMPLE_RATE)
                print(f"✅ Audio successfully saved to: {current_audio_file_path}")
            else:
                print("⚠️ No audio data to save")
        except Exception as e:
            print(f"❌ Error saving audio: {e}")


        # Clean up transcription
        if 'stt_recorder' in locals():
            stt_recorder.stop()
        # transcription_thread = None
        stop_flag.clear() # Clear the flag for the next run
