# Real time speech to text

from RealtimeSTT import AudioToTextRecorder

def process_text(text):
    print(text)

def my_start_callback():
    print("Recording started!")

def my_stop_callback():
    print("Recording stopped!")


if __name__ == '__main__':
    
    # recorder = AudioToTextRecorder(on_recording_start=my_start_callback,
    #                            on_recording_stop=my_stop_callback)

    recorder = AudioToTextRecorder()
    
    # recorder.start()
    # input("Press Enter to stop recording...")
    # recorder.stop()

    # print('Say "Jarvis" to start recording.')

    while True:
        recorder.text(process_text)
        # print("Transcription: ", recorder.text())