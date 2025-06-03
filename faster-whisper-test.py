from faster_whisper import WhisperModel

# Choose the model size you want to use. Common options are:
# "tiny", "base", "small", "medium", "large-v2" (or "large").
# Larger models are more accurate but require more resources.
model_size = "base"

# Run on GPU if available, otherwise run on CPU

model = WhisperModel(model_size, device="cpu", compute_type="float32")

# Example usage with an audio file:
audio_file = "/Users/sayali/Documents/Data Science/MM generator/uploads/EarningsCall.wav"  # Replace with the path to your audio file
segments, info = model.transcribe(audio_file, beam_size=5)

print("Detected language '%s' with probability %f" % (info.language, info.language_probability))

for segment in segments:
    print("[%.2fs -> %.2fs] %s" % (segment.start, segment.end, segment.text))

# Example usage with in-memory audio data (e.g., from a microphone):
# Assuming you have audio_data as a NumPy array and sample_rate
# segments, info = model.transcribe(audio_data, sample_rate=sample_rate, beam_size=5)
# ... (process segments as above)