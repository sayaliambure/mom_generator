import React, { useState, useEffect, useRef } from "react";
import axios from 'axios';
import { PencilSquareIcon, XMarkIcon } from "@heroicons/react/24/solid";

const MeetingMinutesGenerator = () => {
  const [mode, setMode] = useState(""); // "upload" or "record"
  const [file, setFile] = useState(null);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [attendees, setAttendees] = useState("");
  const [transcript, setTranscript] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLive, setShowLive] = useState(false);
  const [intervalId, setIntervalId] = useState(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [summary, setSummary] = useState("");
  const [actionItems, setActionItems] = useState("");
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [generatingActions, setGeneratingActions] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');

  const previousTranscriptRef = useRef(""); // Used to track the last live segment

  useEffect(() => {
    let interval;
    if (isLive) {
      interval = setInterval(fetchLiveTranscript, 2000);
    }
    return () => clearInterval(interval);
  }, [isLive]);

  const fetchLiveTranscript = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/get_live_transcript");
      const data = await res.json();
      console.log(data.text, 'live transcript');
      const newText = data.text.trim();

      // Append only if the new segment is different
      if (newText && newText !== previousTranscriptRef.current) {
        setLiveTranscript((prev) => prev + "\n" + newText);
        previousTranscriptRef.current = newText; // Update the reference
      }

    } catch (err) {
      console.error("Failed to fetch live transcript");
    }
  };

  const startLiveTranscript = () => {
    if (intervalId) clearInterval(intervalId); // prevent multiple intervals
    setShowLive(true);
    const id = setInterval(fetchLiveTranscript, 1000);
    setIntervalId(id);
  };

  const stopLiveTranscript = () => {
    setShowLive(false);
    clearInterval(intervalId);
    setIntervalId(null);
  };

  const getStoredTranscript = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:5000/get_transcript_file');
      setTranscriptText(await res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setMode("upload");
  };

  const startRecording = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/start_realtime_transcription", { method: "POST", 
        headers: {
          "Content-Type": "application/json"
        } });
      if (res.ok) {
        setIsLive(true);
        setIsRecording(true);
        setLiveTranscript(""); // Reset
        previousTranscriptRef.current = "";
      } else {
        alert("Failed to start live transcription");
      }
    } catch (err) {
      alert("Backend error");
    }
  };

  const stopRecording = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/stop_realtime_transcription", { method: "POST" });
      if (res.ok) {
        setIsLive(false);
        setIsRecording(false);
        const data = await res.json();
        setTranscript(data.transcript);
      } else {
        alert("Failed to stop transcription");
      }
    } catch (err) {
      alert("Backend error");
    }
  };

  const handleGenerate = async () => {
    if (mode === "upload" && !file) {
      alert("Please upload a file first.");
      return;
    }

    const formData = new FormData();
    if (file) formData.append("file", file);

    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:5000/transcribe", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setTranscript(data.transcript);
      } else {
        alert(data.error || "Transcription failed");
      }
    } catch (err) {
      alert("Server error");
    } finally {
      setLoading(false);
    }
  };


  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const res = await axios.post("http://127.0.0.1:5000/summarize", {
        transcript: transcript || transcriptText,
      });
      setSummary(res.data.summary);
    } catch (err) {
      alert("Error generating summary");
    } finally {
      setGeneratingSummary(false);
    }
  };
  
  const handleGenerateActionItems = async () => {
    setGeneratingActions(true);
    try {
      const res = await axios.post("http://127.0.0.1:5000/action_items", {
        transcript: transcript || transcriptText,
      });
      setActionItems(res.data.action_items);
    } catch (err) {
      alert("Error generating action items");
    } finally {
      setGeneratingActions(false);
    }
  };
  
  

  return (
    <div className="max-w-5xl mx-auto mt-10 p-6 bg-white rounded-lg shadow-md relative">
      <h1 className="text-3xl font-bold text-center mb-4">Meeting Minutes Generator</h1>
      <p className="text-center text-gray-500 mb-8">Upload or record a meeting to generate transcripts and minutes</p>

      <div className="flex justify-center gap-4 mb-6">
        <button onClick={() => setMode("upload")} className={`px-4 py-2 rounded ${mode === "upload" ? "bg-black text-white" : "bg-gray-200"}`}>
          Upload Audio File
        </button>
        <button onClick={() => setMode("record")} className={`px-4 py-2 rounded ${mode === "record" ? "bg-black text-white" : "bg-gray-200"}`}>
          Record Meeting
        </button>
      </div>

      {mode === "upload" && (
        <div className="border rounded-lg p-6 border-dashed border-gray-300 bg-gray-50 mb-6 text-center">
          <input
            type="file"
            accept="audio/*,video/*"
            onChange={handleFileChange}
            className="hidden"
            id="fileInput"
          />
          <label htmlFor="fileInput" className="cursor-pointer text-blue-600 font-semibold">
            {file ? file.name : "Choose File"}
          </label>
        </div>
      )}

      {mode === "record" && (
        <div className="mb-6 text-center">
          {!isRecording ? (
              <button onClick={startRecording} className="bg-blue-500 text-white px-4 py-2 rounded">Start Recording</button>
            ) : (
              <div className="space-x-2">
                <button onClick={stopRecording} className="bg-red-500 text-white px-4 py-2 rounded">Stop Recording</button>
                {!showLive ? (
                  <button onClick={startLiveTranscript} className="bg-green-500 text-white px-4 py-2 rounded">Show Live Transcript</button>
                ) : (
                  <button onClick={stopLiveTranscript} className="bg-yellow-500 text-white px-4 py-2 rounded">Stop Showing Live</button>
                )}
              </div>
            )}

          {showLive && (
            <div className="bg-gray-100 p-4 rounded shadow max-h-48 overflow-y-auto whitespace-pre-wrap">
              {liveTranscript || 'Listening...'}
            </div>
          )}
        </div>
      )}

      <input
        type="text"
        placeholder="Meeting Title"
        value={meetingTitle}
        onChange={(e) => setMeetingTitle(e.target.value)}
        className="w-full border rounded p-2 mb-4"
      />
      <input
        type="date"
        value={meetingDate}
        onChange={(e) => setMeetingDate(e.target.value)}
        className="w-full border rounded p-2 mb-4"
      />
      <textarea
        placeholder="Attendees (e.g. John Doe, Jane Smith)"
        value={attendees}
        onChange={(e) => setAttendees(e.target.value)}
        className="w-full border rounded p-2 mb-4"
        rows={2}
      />

      {mode === "upload" ? (
      <button
        onClick={handleGenerate}
        disabled={loading}
        className={`w-full p-3 text-white font-bold rounded ${loading ? "bg-gray-400" : "bg-black hover:bg-gray-800"}`}
      >
        {loading ? "Generating..." : "Generate Transcript"}
      </button>
      ) : (
      <button
        onClick={getStoredTranscript}
        disabled={loading}
        className={`w-full p-3 text-white font-bold rounded ${loading ? "bg-gray-400" : "bg-black hover:bg-gray-800"}`}
      >
        {loading ? "Fetching..." : "Get Transcript"}
      </button>
      )}

      {mode === "upload" ? (
        transcript && (
          <div className="mt-8 bg-gray-100 p-4 rounded">
            <h2 className="text-xl font-semibold mb-2">Meeting Transcript</h2>
            <p className="whitespace-pre-wrap">{transcript}</p>
          </div>
        )
      ) : (
        transcriptText && (
          <div className="mt-8 bg-gray-100 p-4 rounded">
            <h2 className="text-xl font-semibold mb-2">Meeting Transcript</h2>
            <pre className="whitespace-pre-wrap">{transcriptText}</pre>
          </div>
        )
      )}


      {(transcript || transcriptText) && (
        <div className="mt-6 flex gap-4">
          <button
            onClick={handleGenerateSummary}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            disabled={generatingSummary}
          >
            {generatingSummary ? "Generating summary..." : "Generate Summary"}
          </button>

          <button
            onClick={handleGenerateActionItems}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            disabled={generatingActions}
          >
            {generatingActions ? "Generating action items..." : "Generate Action Items"}
          </button>
        </div>
      )}

      {summary && (
        <div className="mt-6 bg-gray-50 p-4 border rounded">
          <h2 className="text-xl font-semibold mb-2">Summary</h2>
          <p className="whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {actionItems && (
        <div className="mt-6 bg-gray-50 p-4 border rounded">
          <h2 className="text-xl font-semibold mb-2">Action Items</h2>
          <p className="whitespace-pre-wrap">{actionItems}</p>
        </div>
      )}


      <button
        onClick={() => setShowNotes(true)}
        className="fixed bottom-10 right-10 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20h9" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 4h6m-3 0v16M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        
        Take Notes
      </button>

      {/* {showNotes && (
        <div className="fixed inset-0 bg-white z-50 p-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Notes</h2>
            <button
              onClick={() => setShowNotes(false)}
              className="text-gray-600 hover:text-black text-lg font-bold"
            >
              ✕
            </button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full h-[80vh] border p-4 rounded resize-none text-gray-700"
            placeholder="Write your notes here..."
          />
        </div>
      )} */}


{/* Notes Popup */}
{showNotes && (
  <div className="fixed bottom-24 right-8 w-96 bg-white shadow-lg rounded-lg p-4 z-50">
    <div className="flex justify-between items-center mb-2">
      <h2 className="text-lg font-semibold">Quick Notes</h2>
      <button onClick={() => setShowNotes(false)}>
        <XMarkIcon className="h-5 w-5 text-gray-500 hover:text-gray-700" />
      </button>
    </div>
    <textarea
      className="w-full h-96 p-2 border border-gray-300 rounded"
      value={notes}
      onChange={(e) => setNotes(e.target.value)}
      placeholder="Type your notes here..."
    />
  </div>
)}


        
    </div>
  );
};

export default MeetingMinutesGenerator;
