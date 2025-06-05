import time, os
import threading
from RealtimeSTT import AudioToTextRecorder
from queue import Queue
from flask import send_file

realtime_transcript_queue = Queue()

stop_flag = threading.Event() # A flag to signal the transcription thread to stop
recorder = None
transcription_thread = None
# Global variable to store the latest real-time transcript
# realtime_transcript = ""
# recording_duration = 30  # seconds

TRANSCRIPT_FILE_PATH = "transcripts/live_transcript.txt"
os.makedirs("transcripts", exist_ok=True)

def process_text(text):
    print(f"Realtime Transcription: {text}")
    realtime_transcript_queue.put(text)
    with open(TRANSCRIPT_FILE_PATH, "a", encoding="utf-8") as f:
        f.write(text + "\n")

def get_realtime_transcript_queue():
    texts = []
    while not realtime_transcript_queue.empty():
        texts.append(realtime_transcript_queue.get())
    return "\n".join(texts)


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
