import os, requests, json
from dotenv import load_dotenv

load_dotenv()

NVIDIA_API_TOKEN = os.getenv("NVIDIA_API_TOKEN")
NVIDIA_INVOKE_URL = os.getenv("NVIDIA_INVOKE_URL")
LLM_MODEL_NAME = os.getenv("LLM_MODEL_NAME")

HEADERS = {
    "Authorization": f"Bearer {NVIDIA_API_TOKEN}",
    "Accept": "application/json"  # Use "text/event-stream" if stream=True
}


def query_nvidia_model(transcript, task_prompt):
    prompt = f"{task_prompt}\n\nTranscript:\n{transcript}"
    payload = {
        "model": LLM_MODEL_NAME,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1024,
        "temperature": 0.8,
        "top_p": 1.0,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0,
        "stream": False
    }

    response = requests.post(NVIDIA_INVOKE_URL, headers=HEADERS, json=payload)

    if response.status_code == 200:
        return response.json()["choices"][0]["message"]["content"]
    else:
        print("Error from NVIDIA API:", response.text)
        return None



def query_nvidia_scoring_model(transcript, agenda, task_prompt):
    prompt = f"{task_prompt}\n\nAgenda:\n{agenda}\nTranscript:\n{transcript}"
    payload = {
        "model": LLM_MODEL_NAME,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1024,
        "temperature": 0.8,
        "top_p": 1.0,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0,
        "stream": False
    }

    response = requests.post(NVIDIA_INVOKE_URL, headers=HEADERS, json=payload)

    if response.status_code == 200:
        return response.json()["choices"][0]["message"]["content"]
    else:
        print("Error from NVIDIA API:", response.text)
        return None