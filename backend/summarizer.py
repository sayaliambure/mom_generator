from transformers import BartTokenizer, BartForConditionalGeneration
from transformers import pipeline
import re 
import torch
device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")

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
    Model running on local 
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



# def extract_action_items(text, max_chunk_tokens=1024):
    """
    Extracts action items from a long meeting transcript using prompt-based generation.
    Splits the transcript into chunks and generates bullet-point action items.
    """
    prompt_prefix = (
        "Extract clear and concise action items from the following meeting transcript. "
        "Format the output as bullet points, with each bullet being a specific task or decision:\n\nTranscript:\n"
    )

    # Step 1: Split text into chunks
    chunks = split_text_into_chunks(text, max_chunk_tokens, tokenizer)
    action_items = []

    for i, chunk in enumerate(chunks):
        print(f"Extracting action items from chunk {i+1}/{len(chunks)}...")
        prompt = f"{prompt_prefix}{chunk}\n\nAction Items:\n•"

        inputs = tokenizer(prompt, return_tensors="pt", max_length=1024, truncation=True).to("cpu")

        outputs = model.generate(
            inputs["input_ids"],
            max_length=300,
            min_length=50,
            length_penalty=1.8,
            num_beams=4,
            early_stopping=True
        )

        result = tokenizer.decode(outputs[0], skip_special_tokens=True)

        # Clean and standardize bullet points
        bullets = ["• " + item.strip() for item in result.split("•") if item.strip()]
        action_items.extend(bullets)

    return "\n".join(action_items)


def extract_action_items(text):
    # Custom prompt to instruct the model
    prompt = (
        "Extract clear and concise action items from the following meeting transcript. "
        "Format the output as bullet points, with each bullet being a specific task or decision:\n\nTranscript:\n"
        f"{text}\n\nAction Items:\n"
    )

    # Tokenize the full prompt
    inputs = tokenizer(prompt, return_tensors="pt", max_length=1024, truncation=True).to("cpu")

    # Generate action items
    outputs = model.generate(
        inputs["input_ids"],
        max_length=300,
        min_length=100,
        length_penalty=1.8,
        num_beams=4,
        # early_stopping=True
    )

     # Decode output
    decoded = tokenizer.decode(outputs[0], skip_special_tokens=True)

    parts = re.split(r'\s*\d+\.\s*', decoded)
    action_items = [item.strip() for item in parts if item.strip()]
    # Post-processing: Remove the trailing sentence about the meeting date
    # This assumes the meeting date information always appears at the end.
    # if action_items:
    #     last_item = action_items[-1]
    #     # Find the start of "The meeting was held on"
    #     meeting_info_start = last_item.find("The meeting was held on")
    #     if meeting_info_start != -1:
    #         action_items[-1] = last_item[:meeting_info_start].strip()

    # # Format as bullet points
    # formatted_output = "\n".join([f"• {item.rstrip(';')}" for item in action_items if item.strip()])



    # # Extract only the action items (strip anything before a known anchor if needed)
    # cleaned_output = decoded.split("Action Items:")[-1].strip()
    # # Extract and normalize bullets or numbered lines
    # lines = cleaned_output.split("\n")
    # action_items = []
    # for line in lines:
    #     line = line.strip()
    #     if not line:
    #         continue
    #     # Clean leading numbers, bullets, or dashes
    #     line = line.lstrip("•-0123456789. ").strip()
    #     if line:
    #         action_items.append("• " + line)


    print('decodedd; ', decoded)
    # print('bullets', bullets)
    return action_items
