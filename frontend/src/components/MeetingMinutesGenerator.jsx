import React, { useState, useEffect, useRef } from "react";
import axios from 'axios';
import { ArrowDownTrayIcon, XMarkIcon, 
  MicrophoneIcon, StopIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/solid";

const MeetingMinutesGenerator = () => {
  const [mode, setMode] = useState(""); // "upload" or "record"
  const [file, setFile] = useState(null);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [attendees, setAttendees] = useState("");
  const [meetingAgenda, setAgenda] = useState("");
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
  const [editableTranscript, setEditableTranscript] = useState("");
  const [editableSummary, setEditableSummary] = useState("");
  const [editableActionItems, setEditableActionItems] = useState("");

  const previousTranscriptRef = useRef(""); // Used to track the last live segment
  const seenLinesRef = useRef(new Set());

  useEffect(() => {
    let interval;
    if (isLive) {
      interval = setInterval(fetchLiveTranscript, 2000);
    }
    return () => clearInterval(interval);
  }, [isLive]);

  useEffect(() => {
    setEditableTranscript(transcript || transcriptText || "");
  }, [transcript, transcriptText]);
  
  useEffect(() => {
    setEditableSummary(summary);
  }, [summary]);
  
  useEffect(() => {
    setEditableActionItems(actionItems);
  }, [actionItems]);
  

  const fetchLiveTranscript = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/get_live_transcript");
      const data = await res.json();
      console.log(data.text, 'live transcript');
      const newText = data.text.trim();

      if (!newText) return;
      const newLines = newText.split('\n').map(line => line.trim()).filter(Boolean);
      const uniqueNewLines = newLines.filter(line => !seenLinesRef.current.has(line));
      if (uniqueNewLines.length > 0) {
        // const timestampedLines = uniqueNewLines.map(
        //   line => `[${new Date().toLocaleTimeString()}] ${line}`
        // );
        // setLiveTranscript(prev => prev + "\n" + timestampedLines.join("\n"));
        setLiveTranscript(prev => prev + "\n" + uniqueNewLines.join("\n"));
        uniqueNewLines.forEach(line => seenLinesRef.current.add(line));
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
        seenLinesRef.current = new Set(); // Reset seen lines
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

  const DownloadButton = ({ content, filename }) => {
    const handleDownload = () => {
      const element = document.createElement("a");
      const file = new Blob([content], { type: "text/plain" });
      element.href = URL.createObjectURL(file);
      element.download = filename;
      document.body.appendChild(element); // required for Firefox
      element.click();
      document.body.removeChild(element);
    };
  
    return (
      <button
        onClick={handleDownload}
        className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
      >
        <ArrowDownTrayIcon className="h-5 w-5" />
        {/* Download */}
      </button>
    );
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
        <div className="flex flex-col items-center mb-6 space-y-4">
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition"
            >
              <MicrophoneIcon className="h-5 w-5" />
              Start Recording
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-2 sm:space-y-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded transition"
                >
                  <StopIcon className="h-5 w-5" />
                  Stop Recording
                </button>
              </div>

        <div className="flex items-center gap-2">
          {!showLive ? (
            <button
              onClick={startLiveTranscript}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded transition"
            >
              <EyeIcon className="h-5 w-5" />
              Show Live Transcript
            </button>
          ) : (
            <button
              onClick={stopLiveTranscript}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded transition"
            >
              <EyeSlashIcon className="h-5 w-5" />
              Stop Live Transcript
            </button>
          )}
        </div>
      </div>
    )}

    {showLive && (
      <div className="w-full max-w-3xl px-4">
        <h2 className="text-lg font-semibold text-gray-700 mb-2 text-center">Live Transcript</h2>
        <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200 max-h-64 overflow-y-auto whitespace-pre-wrap text-left text-sm text-gray-800">
          {liveTranscript || 'Listening...'}
        </div>
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
        rows={1}
      />

      <textarea
        placeholder="Meeting Agenda"
        value={meetingAgenda}
        onChange={(e) => setAgenda(e.target.value)}
        className="w-full border rounded p-2 mb-4"
        rows={3}
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



      {(editableTranscript || transcriptText) && (
        <div className="mt-8 bg-gray-100 p-4 rounded">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-semibold">Meeting Transcript</h2>
            <div className="mt-2">
                <DownloadButton content={transcript} filename="transcript.txt" />
              </div>
          </div>
          <textarea
            value={editableTranscript}
            onChange={(e) => setEditableTranscript(e.target.value)}
            className="w-full p-2 border rounded whitespace-pre-wrap"
            rows={10}
          />
        </div>
      )}


      {(transcript || transcriptText) && (
        <div className="mt-6 flex gap-4">
          <button
            onClick={handleGenerateSummary}
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-800"
            disabled={generatingSummary}
          >
            {generatingSummary ? "Generating summary..." : "Generate Summary"}
          </button>

          <button
            onClick={handleGenerateActionItems}
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-800"
            disabled={generatingActions}
          >
            {generatingActions ? "Generating action items..." : "Generate Action Items"}
          </button>
        </div>
      )}

      {summary && (
        <div className="mt-6 bg-gray-50 p-4 border rounded">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-semibold">Summary</h2>
              <div className="mt-2">
                <DownloadButton content={summary} filename="summary.txt" />
              </div>
          </div>
          <textarea
            value={editableSummary}
            onChange={(e) => setEditableSummary(e.target.value)}
            className="w-full p-2 border rounded whitespace-pre-wrap"
            rows={6}
          />
        </div>
      )}

      {actionItems && (
        <div className="mt-6 bg-gray-50 p-4 border rounded">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-semibold">Action Items</h2>
            <div className="mt-2">
              <DownloadButton content={actionItems} filename="action_items.txt" />
            </div>
          </div>
          <textarea
            value={editableActionItems}
            onChange={(e) => setEditableActionItems(e.target.value)}
            className="w-full p-2 border rounded whitespace-pre-wrap"
            rows={6}
          />
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
