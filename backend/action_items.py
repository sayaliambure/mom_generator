# # action_items.py
# from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline

# # Use a small instruction-tuned model
# model_name = "google/flan-t5-base"

# tokenizer = AutoTokenizer.from_pretrained(model_name)
# model = AutoModelForSeq2SeqLM.from_pretrained(model_name)

# generator = pipeline("text2text-generation", model=model, tokenizer=tokenizer)
# MAX_TOKENS = 400  # Keep it under 512 for safety


# def chunk_text(text, max_tokens):
#     words = text.split()
#     chunks = []
#     current_chunk = []

#     for word in words:
#         current_chunk.append(word)
#         tokenized = tokenizer(" ".join(current_chunk), return_tensors="pt", truncation=False)
#         if tokenized["input_ids"].shape[1] > max_tokens:
#             current_chunk.pop()  # remove last word that broke the limit
#             chunks.append(" ".join(current_chunk))
#             current_chunk = [word]  # start new chunk

#     if current_chunk:
#         chunks.append(" ".join(current_chunk))

#     return chunks

# def generate_action_items(transcript: str) -> str:
#     chunks = chunk_text(transcript, MAX_TOKENS)
#     all_action_items = []

#     for i, chunk in enumerate(chunks):
#         prompt = (
#             "Extract clear action items from the following meeting transcript:\n\n"
#             f"{chunk}\n\n"
#             "Action Items:"
#         )

#         output = generator(prompt, max_new_tokens=200)[0]["generated_text"]
#         all_action_items.append(output.strip())

#     # Merge all chunk results
#     return "\n".join(all_action_items)