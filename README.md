# Minutes of Meeting Generator

This project aims to streamline the process of generating meeting minutes, summaries, and action items using advanced AI capabilities for transcription, speaker diarization, and natural language understanding.

Demo of the tool: <a href="https://drive.google.com/file/d/1hUyOhKw8d1NFfpTopcAHwGljV5luYlC3/view?usp=drive_link" target="_blank"> View here </a> <br>
## Features

### 1. Meeting Audio Handling
This tool allows flexible handling of meeting audio through Flask APIs and React frontend:
* **Upload:** Easily upload your meeting audio files.
* **Record:** Directly record meeting audio within the application.

### 2. Intelligent Content Generation
Leveraging powerful AI models, we generate comprehensive meeting insights:

#### From Transcripts (Whisper - base model)
* **With Speaker Identification:**
    * **Speaker Diarization:** Utilizes `pyannote` to differentiate between speakers.
    * **Speaker Recognition:** Employs `resemblyzer` for identifying known speakers.
* **Without Speaker Identification:** Generates a plain transcript without attributing speech to specific individuals.

#### Below items generated using Llama-4-scout-17b-instruc model
* **Summary:** Concise overview of the meeting's key points.
* **Action Items:** Automatically extracts actionable tasks and responsibilities.
* **Minutes:** Detailed, structured meeting minutes.
* **Sentiment Analysis:** Provides insights into the overall sentiment expressed during the meeting.
* **Meeting Score:** Evaluates how well the meeting aligned with its stated agenda.

### 3. User Management
Secure and efficient user management using Supabase for:
* User Sign-in
* Login
* Authentication

### 4. Meeting Item Management
Manage meeting-related content with Flask APIs:
* **Edit Meeting Items:** Modify generated summaries, action items, or minutes.
* **Download Meeting Items as PDF:** Export meeting outputs in a convenient PDF format.
* **Save and View All Items of Meeting According to User:** Persist and access all meeting-related data associated with your user account.

### 5. Smart Note-Taking
Integrated note-taking functionality powered by Supabase and React:

#### While Listening to Audio Preview
* **Pointer to Indicate When Particular Note is Taken:**
    * View that note.
    * Added to transcript with timestamps [This is further used as context for generating meeting summary and other meeting items]
    * Saved to DB with audio file name.
    * View in profile section.

#### While Not Listening to Audio Preview
* Saved to DB.
* View in profile section.

#### 6. RAG (Retrieval-Augmented Generation)
Enhance your interaction with meeting data through RAG capabilities:
* **Ask Questions and Converse with Meeting Data:** Pose queries and engage in conversations based on the meeting's content.
* **See Sources of the Answer:** Trace back the origin of information provided, linking answers to specific parts of the meeting data.
* **Input Document:** Utilizes existing meeting transcripts and other relevant parameters for RAG queries.


## Technologies Used
* **Backend:** Flask (APIs)
* **Frontend:** React
* **Database & Auth:** Supabase
* **Transcription:** Whisper (base model)
* **Speaker Diarization:** `pyannote`
* **Speaker Recognition:** `resemblyzer`
* **Content Generation (Summary, Action Items, etc.):** Llama-4-scout-17b-instruct model
* **Vector Database:** Faiss
  
---