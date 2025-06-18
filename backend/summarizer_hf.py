from transformers import BartTokenizer, BartForConditionalGeneration
from transformers import pipeline
import re , os, requests
from dotenv import load_dotenv

load_dotenv()

HUGGINGFACE_API_TOKEN = os.getenv("HUGGINGFACE_API_TOKEN")
API_URL = "https://api-inference.huggingface.co/models/facebook/bart-large-cnn"
HEADERS = {"Authorization": f"Bearer {HUGGINGFACE_API_TOKEN}"}

MAX_WORDS_PER_CHUNK = 800  # BART model token limit ~1024 tokens ≈ 800 words


def summarize_with_hf_api(text, min_length=100, max_length=500):
    payload = {
        "inputs": text,
        "parameters": {
            "min_length": min_length,
            "max_length": max_length
        }
    }
    response = requests.post(API_URL, headers=HEADERS, json=payload)
    if response.status_code != 200:
        print("API Error:", response.status_code, response.text)
        return "ERROR: Could not summarize."
    return response.json()[0]["summary_text"]


# === Word-based chunking ===
def split_text_into_chunks(text, max_words=MAX_WORDS_PER_CHUNK):
    words = text.split()
    return [" ".join(words[i:i + max_words]) for i in range(0, len(words), max_words)]


# def split_text_into_chunks(text, max_words=800):
    """
    Splits text into word-based chunks (approximation of token count).
    """
    words = text.split()
    chunks = []
    for i in range(0, len(words), max_words):
        chunk = words[i:i + max_words]
        chunks.append(" ".join(chunk))
    return chunks



# === Final summarizer ===
def summarize_long_text_hf(text, hierarchical_pass=True):
    words = text.split()
    chunking_needed = len(words) > MAX_WORDS_PER_CHUNK

    if not chunking_needed:
        print("Text within limit — summarizing directly...")
        return summarize_with_hf_api(text)

    print(f"Text too long ({len(words)} words) — chunking...")
    chunks = split_text_into_chunks(text)
    chunk_summaries = []

    for i, chunk in enumerate(chunks):
        print(f"Summarizing chunk {i + 1}/{len(chunks)}...")
        summary = summarize_with_hf_api(chunk)
        chunk_summaries.append(summary)

    combined_summary = " ".join(chunk_summaries)

    if hierarchical_pass and len(chunk_summaries) > 1:
        print("Running coherence pass...")
        combined_summary = summarize_with_hf_api(combined_summary, max_length=300, min_length=100)

    return combined_summary