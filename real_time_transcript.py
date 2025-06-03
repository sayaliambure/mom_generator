import time
import threading
from RealtimeSTT import AudioToTextRecorder

stop_flag = threading.Event() # A flag to signal the transcription thread to stop
recorder = None
transcription_thread = None
# Global variable to store the latest real-time transcript
# realtime_transcript = ""
# recording_duration = 30  # seconds

def process_text(text):
    # global realtime_transcript
    print(f"Realtime Transcription: {text}")
    # Append or update the global transcript
    # realtime_transcript += text + "\n"

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
