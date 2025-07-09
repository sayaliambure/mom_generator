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

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

# Load data, chunk, embed, store into FAISS + Pickle
def build_meeting_index():
    # Initialize Supabase client
    supabase = create_client(url, key)

    # Fetch meetings and notes
    meetings_data = supabase.table("meetings").select("id, title, transcript, date").execute().data
    notes_data = supabase.table("notes").select("id, content, meeting_id, timestamp").execute().data

    # Group notes by meeting_id
    notes_by_meeting = {}
    for note in notes_data:
        meeting_id = note["meeting_id"]
        if meeting_id not in notes_by_meeting:
            notes_by_meeting[meeting_id] = []
        notes_by_meeting[meeting_id].append(note)

    documents = []

    # Build structured meeting documents
    for m in meetings_data:
        meeting_id = m["id"]
        metadata_base = {
            "meeting_id": meeting_id,
            "title": m["title"],
            "date": m["date"]
        }

        # Add transcript as document
        if m["transcript"]:
            documents.append({
                "text": m["transcript"],
                "metadata": {
                    **metadata_base,
                    "type": "transcript"
                }
            })

        # Add notes as documents under the same meeting
        meeting_notes = notes_by_meeting.get(meeting_id, [])
        for note in meeting_notes:
            if note["content"]:
                documents.append({
                    "text": note["content"],
                    "metadata": {
                        **metadata_base,
                        "type": "note",
                        "note_id": note["id"],
                        "timestamp": note["timestamp"]
                    }
                })

    print(f"Prepared {len(documents)} documents for embedding.")

    # Split into chunks
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    chunked_docs = []
    for doc in documents:
        chunks = splitter.create_documents([doc["text"]], metadatas=[doc["metadata"]])
        chunked_docs.extend(chunks)

    print(f"Split into {len(chunked_docs)} chunks.")

    # Embed
    texts = [doc.page_content for doc in chunked_docs]
    embeddings = embedding_model.encode(texts, convert_to_numpy=True)

    # Create FAISS index
    dimension = embeddings[0].shape[0]
    index = faiss.IndexFlatL2(dimension)
    index.add(np.array(embeddings))

    # Save index and metadata
    faiss.write_index(index, "meeting_index.faiss")
    with open("metadata.pkl", "wb") as f:
        pickle.dump(chunked_docs, f)

    print("Indexing complete. FAISS + metadata saved to disk.")


# Query index, do RAG, return answer
def query_meeting_qa(user_query):
    # Load FAISS index and metadata
    index = faiss.read_index("meeting_index.faiss")

    with open("metadata.pkl", "rb") as f:
        metadata_store = pickle.load(f)

    # Embed query
    print('User quesry: ', user_query)
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
