import numpy as np
import sounddevice as sd
import soundfile as sf
import os, time
import threading
from queue import Queue
from faster_whisper import WhisperModel
import torch
device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")


class CustomTranscriber:
    def __init__(self):
        try:
            print("Initializing Whisper model...")
            self.model = WhisperModel("small", device='cpu', compute_type="int8")
            print("Model initialized successfully")
            self.audio_buffer = []
            self.live_transcript = ""
            self.stop_flag = threading.Event()
            self.lock = threading.Lock()
            self.sample_rate = 16000
            self.stream = None
            self.processing_thread = None
            self.transcript_file = ""
            self.audio_file = ""
            self.initialized = True
        except Exception as e:
            print(f"Failed to initialize transcriber: {str(e)}")
            self.initialized = False
            raise

    def audio_callback(self, indata, frames, time, status):
        """Called for each audio block from microphone"""
        if status:
            print(f"Audio status: {status}")
        
        # Calculate volume metrics
        rms = np.sqrt(np.mean(indata**2))
        max_val = np.max(np.abs(indata))
        print(f"Audio - RMS: {rms:.4f}, Peak: {max_val:.4f}", end='\r')
        
        if rms < 0.01:  # Very quiet threshold
            print("\nWarning: Low audio input (increase microphone volume)")
        
        if not self.stop_flag.is_set():
            with self.lock:
                self.audio_buffer.append(indata.copy())

    def process_audio(self):
        """Process audio chunks and transcribe using Whisper"""
        print("Audio processing thread started")
        min_audio_length = 1.0  # Minimum seconds of audio to process
        min_samples = int(self.sample_rate * min_audio_length)
        
        while not self.stop_flag.is_set():
            with self.lock:
                if len(self.audio_buffer) * 1024 >= min_samples:  # 1024 samples per chunk
                    audio_np = np.concatenate(self.audio_buffer)
                    self.audio_buffer = []
                    
                    # Normalize and boost volume
                    max_val = np.max(np.abs(audio_np))
                    if max_val > 0:
                        audio_np = (audio_np / max_val) * 0.9  # Normalize to 90% of max volume
                    
                    try:
                        # Print audio stats for debugging
                        print(f"Processing {len(audio_np)/self.sample_rate:.2f}s audio "
                            f"(max: {np.max(np.abs(audio_np)):.3f}, "
                            f"rms: {np.sqrt(np.mean(audio_np**2)):.3f})")
                        
                        segments, info = self.model.transcribe(
                            audio_np,
                            beam_size=3,  # Faster processing
                            vad_filter=True,
                            no_speech_threshold=0.6,
                            log_prob_threshold=-1.0
                        )
                        
                        text = " ".join(segment.text.strip() for segment in segments if segment.text.strip())
                        print(f"Raw transcript: '{text}'")
                        
                        if text:
                            with self.lock:
                                self.live_transcript += text + "\n"
                                # Save incrementally
                                with open(self.transcript_file, 'a', encoding='utf-8') as f:
                                    f.write(text + "\n")
                    except Exception as e:
                        print(f"Transcription error: {str(e)}")
            
            time.sleep(0.2)  # Reduce CPU usage

    def start(self, output_folder):
        """Start real-time transcription"""
        # Create output directory if it doesn't exist
        # List available audio devices
        print("Available audio devices:", sd.query_devices())
         # Use default device or specify one
        # device = sd.default.device
        # print(f"Using audio device: {device} - {sd.query_devices(device)['name']}")
        # Create output directory if it doesn't exist
        os.makedirs(output_folder, exist_ok=True)
        
        # Generate unique filenames
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        self.transcript_file = os.path.join(output_folder, f"transcript_{timestamp}.txt")
        self.audio_file = os.path.join(output_folder, f"audio_{timestamp}.wav")
        
        # List available audio devices
        print("Available audio devices:")
        devices = sd.query_devices()
        for i, dev in enumerate(devices):
            print(f"{i}: {dev['name']} (Inputs: {dev['max_input_channels']}, Outputs: {dev['max_output_channels']})")
        
        # Select appropriate input device
        input_device = None
        for i, dev in enumerate(devices):
            if dev['max_input_channels'] > 0:
                input_device = i
                print(f"Selected input device: {i} - {dev['name']}")
                break
        
        if input_device is None:
            raise ValueError("No input devices available")
        
        # Start audio stream with explicit input device
        try:
            self.stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=1,
                dtype='float32',
                callback=self.audio_callback,
                blocksize=4096,
                device=input_device
            )
            self.stream.start()
        except Exception as e:
            print(f"Error starting audio stream: {str(e)}")
            raise
        
        # Start processing thread
        self.processing_thread = threading.Thread(target=self.process_audio)
        self.processing_thread.start()

    def stop(self):
        """Stop transcription and save results"""
        print("Stopping transcription...")
        self.stop_flag.set()
        
        # Stop audio stream first to prevent new data
        if self.stream:
            print("Stopping audio stream...")
            self.stream.stop()
            self.stream.close()
        
        # Wait for processing thread to finish
        if self.processing_thread:
            print("Waiting for processing thread...")
            self.processing_thread.join(timeout=2)
        
        # Save final audio (ensure we get all remaining chunks)
        if len(self.audio_buffer) > 0:
            print(f"Saving final audio ({len(self.audio_buffer)} chunks)...")
            try:
                audio_np = np.concatenate(self.audio_buffer)
                duration = len(audio_np) / self.sample_rate
                print(f"Saving {duration:.2f} seconds of audio")
                sf.write(self.audio_file, audio_np, self.sample_rate)
                print(f"Audio saved to {self.audio_file}")
            except Exception as e:
                print(f"Error saving audio: {str(e)}")
        
        # Ensure transcript file is created
        try:
            with open(self.transcript_file, 'w', encoding='utf-8') as f:
                f.write(self.live_transcript)
            print(f"Transcript saved to {self.transcript_file}")
        except Exception as e:
            print(f"Error saving transcript: {str(e)}")
        
        return {
            "transcript": self.live_transcript,
            "audio_file": self.audio_file,
            "transcript_file": self.transcript_file
        }

    def get_live_transcript(self):
        """Get the current live transcript"""
        if not self.initialized:
            return "Transcriber not initialized"
            
        with self.lock:
            current_transcript = self.live_transcript
            # Clear the transcript after reading if desired
            # self.live_transcript = ""
            return current_transcript