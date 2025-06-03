from transformers import BartTokenizer, BartForConditionalGeneration
from transformers import pipeline

# Load models
# summarizer = pipeline("summarization", model="facebook/bart-large-cnn")  # Placeholder summarizer
model_name = "facebook/bart-large-cnn"
tokenizer = BartTokenizer.from_pretrained(model_name)
model = BartForConditionalGeneration.from_pretrained(model_name).to("cpu")


def split_text_into_chunks(text, max_tokens, tokenizer):
    """
    Splits text into chunks that fit within the model's token limit.
    """
    tokens = tokenizer.tokenize(text)
    chunks = []
    for i in range(0, len(tokens), max_tokens):
        chunk = tokens[i:i + max_tokens]
        chunks.append(tokenizer.convert_tokens_to_string(chunk))
    return chunks

def summarize_chunk(chunk, max_length=500, min_length=100):
    """
    Summarizes a chunk of text using the BART model.
    """
    # Combine system input and user input into a prompt
    # prompt = f"{system_input}\n\nUser Input: {chunk}"

    # Tokenize the input
    inputs = tokenizer(chunk, return_tensors="pt", max_length=1024, truncation=True).to("cpu")

    # Generate the summary
    outputs = model.generate(
        inputs["input_ids"],
        max_length=max_length,
        min_length=min_length,
        length_penalty=2.0,
        num_beams=4,
        early_stopping=True
    )

    # Decode and return the summary
    summary = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return summary

def summarize_long_text(text, max_chunk_tokens=1024, hierarchical_pass=True):
    """
    Splits long text into chunks, summarizes each chunk, and optionally combines 
    chunk summaries into a final coherent summary.
    """
    # Ensure max_chunk_tokens is an integer
    # if not isinstance(max_chunk_tokens, int):
    #     max_chunk_tokens = int(max_chunk_tokens)

    # Step 1: Split text into manageable chunks
    chunks = split_text_into_chunks(text, max_chunk_tokens, tokenizer)
    chunk_summaries = []

    # Step 2: Summarize each chunk
    for i, chunk in enumerate(chunks):
        print(f"Processing chunk {i+1}/{len(chunks)}...")
        summary = summarize_chunk(chunk)
        chunk_summaries.append(summary)

    # Step 3: Combine chunk summaries and optionally summarize them again
    combined_summary = " ".join(chunk_summaries)
    if hierarchical_pass:
        print("Running a final pass for coherence...")
        combined_summary = summarize_chunk(combined_summary, max_length=300, min_length=100)

    return combined_summary
