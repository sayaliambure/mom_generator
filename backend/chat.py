from supabase import create_client
from langchain.text_splitter import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
import pickle
import requests
import os

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_ANON_KEY")
groq_api_key = os.getenv("GROQ_API_KEY")

# Initialize Supabase client
supabase = create_client(url, key)

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

# Load data, chunk, embed, store into FAISS + Pickle
def build_meeting_index():
    # Fetch meetings and notes
    meetings_data = supabase.table("meetings").select("id, title, transcript, date").execute().data
    notes_data = supabase.table("notes").select("id, content, meeting_id, timestamp").execute().data

    documents = []

    for m in meetings_data:
        if m["transcript"]:
            documents.append({
                "text": m["transcript"],
                "metadata": {
                    "type": "transcript",
                    "meeting_id": m["id"],
                    "title": m["title"],
                    "date": m["date"]
                }
            })

    for n in notes_data:
        if n["content"]:
            documents.append({
                "text": n["content"],
                "metadata": {
                    "type": "note",
                    "meeting_id": n["meeting_id"],
                    "note_id": n["id"],
                    "timestamp": n["timestamp"]
                }
            })

    # Split into chunks
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunked_docs = []
    for doc in documents:
        chunks = splitter.create_documents([doc["text"]], metadatas=[doc["metadata"]])
        chunked_docs.extend(chunks)

    # Embed chunks
    texts = [doc.page_content for doc in chunked_docs]
    embeddings = embedding_model.encode(texts, convert_to_numpy=True)

    # Create FAISS index
    dimension = embeddings[0].shape[0]
    index = faiss.IndexFlatL2(dimension)
    index.add(np.array(embeddings))

    # Save FAISS index and metadata
    faiss.write_index(index, "meeting_index.faiss")
    with open("metadata.pkl", "wb") as f:
        pickle.dump(chunked_docs, f)

    print("Indexing complete. Data saved to disk.")


# Query index, do RAG, return answer
def query_meeting_qa(user_query):
    # Load FAISS index and metadata
    index = faiss.read_index("meeting_index.faiss")

    with open("metadata.pkl", "rb") as f:
        metadata_store = pickle.load(f)

    # Embed query
    query_vector = embedding_model.encode([user_query])
    D, I = index.search(np.array(query_vector).astype("float32"), k=5)

    retrieved_chunks = [metadata_store[i] for i in I[0]]
    retrieved_text = "\n\n".join([chunk.page_content for chunk in retrieved_chunks])

    # Prompt for LLM
    prompt = f"""You are an AI assistant. Use the context below to answer the question.

Context:
{retrieved_text}

Question:
{user_query}

Answer:"""

    headers = {
        "Authorization": f"Bearer {groq_api_key}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "llama3-70b-8192",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2
    }

    response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=data)
    answer = response.json()["choices"][0]["message"]["content"]

    return {
        "answer": answer,
        "sources": [
            {
                "title": doc.metadata.get("title"),
                "meeting_id": doc.metadata.get("meeting_id"),
                "snippet": doc.page_content
            }
            for doc in retrieved_chunks
        ]
    }
