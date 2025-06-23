import React, { useState, useEffect, useRef } from "react";
import axios from 'axios';
import { ArrowDownTrayIcon, XMarkIcon, 
  MicrophoneIcon, StopIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/solid";
import { supabase } from '../supabaseClient';
import { saveMeetingForUser } from '../utils/saveMeetingForUser';
import { saveNoteForUser } from '../utils/saveNoteForUser';

const MeetingMinutesGenerator = ({ onViewProfile, user }) => {
  const [mode, setMode] = useState(""); // "upload" or "record"
  const [file, setFile] = useState(null);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meet_attendees, setMeetAttendees] = useState("");
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
  const [meetingMinutes, setMeetingMinutes] = useState("");
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [generatingActions, setGeneratingActions] = useState(false);
  const [generatingMinutes, setGeneratingMinutes] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [noteTimestamp, setNoteTimestamp] = useState(null);
  const [timestampedNotes, setTimestampedNotes] = useState([]); // {content, timestamp}
  const [editableTranscript, setEditableTranscript] = useState("");
  const [editableSummary, setEditableSummary] = useState("");
  const [editableActionItems, setEditableActionItems] = useState("");
  const [editableMeetingMinutes, setEditableMeetingMinutes] = useState("");
  const [identifySpeakers, setIdentifySpeakers] = useState(false);
  const [attendees, setAttendees] = useState([{ name: "", sample: null }]);
  const [audioURL, setAudioURL] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  const previousTranscriptRef = useRef(""); // Used to track the last live segment
  const seenLinesRef = useRef(new Set());

  const [sentimentResult, setSentimentResult] = useState("");
  const [scoringResult, setScoringResult] = useState("");
  const [analyzingSentiment, setAnalyzingSentiment] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [includeNotesInTranscript, setIncludeNotesInTranscript] = useState(false);

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);

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

  useEffect(() => {
    setEditableMeetingMinutes(meetingMinutes);
  }, [meetingMinutes]);

  useEffect(() => {
    return () => {
      // Clean up any ongoing recording or polling
      if (intervalId) clearInterval(intervalId);
      if (isRecording) {
        stopMediaRecording();
      }
    };
  }, [intervalId, isRecording]);
  
  const fetchLiveTranscript = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/get_live_transcript");
      
      if (!res.ok) {
        const errorData = await res.json();
        console.error("Backend error:", errorData);
        
        // Automatically stop polling if transcription is inactive
        if (errorData.status === "error" && errorData.debug === "Stop flag is set") {
          console.log("Transcription stopped - ending live updates");
          stopLiveTranscript();
          setIsLive(false);
        }
        return;
      }
      
      const data = await res.json();
      
      if (data.status === "success" && data.text) {
        const newText = data.text.trim();
        if (newText && newText !== previousTranscriptRef.current) {
          setLiveTranscript(prev => prev + (prev ? "\n" : "") + newText);
          previousTranscriptRef.current = newText;
        }
      }
    } catch (err) {
      console.error("Failed to fetch live transcript:", err);
      stopLiveTranscript(); // Stop polling on error
    }
  };

  const startLiveTranscript = () => {
    if (!isRecording) {
      console.error("Cannot show live transcript - not recording");
      return;
    }
    
    if (intervalId) clearInterval(intervalId);
    setShowLive(true);
    
    // Start polling with error handling
    const id = setInterval(() => {
      if (isRecording) {
        fetchLiveTranscript();
      } else {
        clearInterval(id);
        setIntervalId(null);
      }
    }, 1000);
    
    setIntervalId(id);
  };

  const stopLiveTranscript = () => {
    setShowLive(false);
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
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
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    setAudioURL(URL.createObjectURL(selectedFile));  // Create temporary URL
    setMode("upload");
  };

  const startRecording = async () => {
    try {
      setAudioURL(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = audioChunks;
      streamRef.current = stream;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert('Error starting recording: ' + err.message);
    }
  };

  const stopRecording = async () => {
    try {
      const mediaRecorder = mediaRecorderRef.current;
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        await new Promise((resolve) => {
          mediaRecorder.onstop = resolve;
          mediaRecorder.stop();
        });
        setIsRecording(false);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setFile(new File([audioBlob], `recording_${Date.now()}.webm`, { type: 'audio/webm' }));
        setAudioURL(URL.createObjectURL(audioBlob));
        // Clean up stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
      }
    } catch (err) {
      alert('Error stopping recording: ' + err.message);
    }
  };

  const handleGenerate = async () => {
    if (mode === "upload" && !file) {
      alert("Please upload a file first.");
      return;
    }

    const formData = new FormData();
    if (file) formData.append("file", file);

    if (identifySpeakers) {
      formData.append("speaker_identification", "true");

      for (let i = 0; i < attendees.length; i++) {
        const att = attendees[i];
        if (!att.name || !att.sample) {
          alert(`Please provide name and sample for attendee ${i + 1}`);
          return;
        }
        formData.append(`attendee_names`, att.name);
        formData.append(`samples`, att.sample);
      }
    }

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
      const res = await axios.post("http://127.0.0.1:5000/action-items", {
        transcript: transcript || transcriptText,
      });
      setActionItems(res.data.action_items);
    } catch (err) {
      alert("Error generating action items");
    } finally {
      setGeneratingActions(false);
    }
  };

  const handleGenerateMinutes = async () => {
    setGeneratingMinutes(true);
    const fullTranscript = editableTranscript || transcript || transcriptText;
    if (!fullTranscript) {
      alert("Please generate a transcript first.");
      return;
    }
    const payload = {
      agenda: meetingAgenda, 
      transcript: {
        value: fullTranscript,
      }
    };
    if (meetingDate) {
      payload.transcript.date = meetingDate;
    }
    if (meetingTitle) {
      payload.transcript.title = meetingTitle;
    }
    if (meet_attendees) {
      payload.transcript.meet_attendees = meet_attendees; 
    }

    try {
      const res = await axios.post("http://127.00.0.1:5000/minutes-of-meeting", payload);
      setMeetingMinutes(res.data.minutes_of_meeting || "Minutes generated successfully!"); 
      // alert("Meeting minutes sent to API successfully!");
    } catch (err) {
      console.error("Error sending meeting minutes to API:", err);
      alert("Error generating meeting minutes. Please try again.");
    }
     finally {
      setGeneratingMinutes(false);
    }
  };

  const handleSentimentAnalysis = async () => {
    const fullTranscript = editableTranscript || transcript || transcriptText;
    if (!fullTranscript) {
      alert("Please generate a transcript first.");
      return;
    }
    setAnalyzingSentiment(true);
    try {
      const res = await axios.post("http://127.0.0.1:5000/sentiment", { transcript: fullTranscript });
      setSentimentResult(res.data.sentiment || res.data.result || JSON.stringify(res.data));
    } catch (err) {
      setSentimentResult("Error analyzing sentiment.");
      console.error(err);
    } finally {
      setAnalyzingSentiment(false);
    }
  };

  const handleScoring = async () => {
    const fullTranscript = editableTranscript || transcript || transcriptText;
    if (!fullTranscript) {
      alert("Please generate a transcript first.");
      return;
    }
    if (!meetingAgenda) {
      alert("Please enter the meeting agenda.");
      return;
    }
    setScoring(true);
    try {
      const res = await axios.post("http://127.0.0.1:5000/scoring-mechanism", { agenda: meetingAgenda, transcript: fullTranscript });
      setScoringResult(res.data.score || res.data.result || JSON.stringify(res.data));
    } catch (err) {
      setScoringResult("Error scoring meeting.");
      console.error(err);
    } finally {
      setScoring(false);
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
  
  // Helper function to clean up media recording
  const stopMediaRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  // Helper to insert notes into transcript
  function insertNotesIntoTranscript(transcript, notes) {
    // If transcript is segmented by time, insert at the right place
    // Otherwise, append at the end
    let result = transcript;
    // Simple: append at the end
    result += '\n\n';
    notes.forEach(note => {
      result += `[note taken by user at ${note.timestamp.toFixed(1)}s: ${note.content}]\n`;
    });
    return result;
  }

  async function handleGenerateWithNotes(transcriptWithNotes) {
    setLoading(true);
    try {
      setTranscript(transcriptWithNotes);
    } finally {
      setLoading(false);
    }
  }

  // Helper to extract audio file name from URL
  function audioFileNameFromUrl(url) {
    if (!url) return null;
    try {
      return url.split('/').pop().split('?')[0];
    } catch {
      return null;
    }
  }

  return (
    <div className="relative min-h-screen bg-gray-100">
      <button
        onClick={handleLogout}
        className="absolute top-4 right-2 bg-gray-800 text-white px-4 py-2 rounded shadow"
      >
        Logout
      </button>
      {onViewProfile && (
        <button
          onClick={onViewProfile}
          className="absolute top-4 right-28 bg-gray-800 text-white px-4 py-2 rounded shadow"
        >
          View Profile
        </button>
      )}
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
          <>
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
            {file && audioURL && (
              <div className="mt-4 w-full">
                <p className="text-gray-600 mb-2">Audio Preview:</p>
                <audio controls src={audioURL} className="w-full" />
                {/* Note markers below audio preview */}
                {timestampedNotes.length > 0 && (
                  <div className="relative w-full h-6 mt-1 flex items-center">
                    {timestampedNotes.map((note, idx) => {
                      const audio = document.querySelector('audio');
                      const duration = audio ? audio.duration : 1;
                      const percent = duration ? (note.timestamp / duration) * 100 : 0;
                      return (
                        <button
                          key={idx}
                          style={{ left: `${percent}%`, transform: 'translateX(-50%)', position: 'absolute', top: 0 }}
                          className="w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow hover:bg-blue-700 cursor-pointer pointer-events-auto"
                          title={`Note at ${note.timestamp.toFixed(1)}s`}
                          onClick={() => {
                            setSelectedNote(note);
                            setShowNoteModal(true);
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="mb-4">
              <label className="inline-flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={identifySpeakers}
                  onChange={(e) => setIdentifySpeakers(e.target.checked)}
                />
                <span>Identify Speakers</span>
              </label>
            </div>
            {identifySpeakers && (
              <div className="space-y-4">
                {attendees.map((attendee, index) => (
                  <div key={index} className="border p-4 rounded-md shadow-sm">
                    <label className="block mb-1 font-medium text-sm">Attendee {index + 1}</label>
                    <input
                      type="text"
                      placeholder="Name"
                      value={attendee.name}
                      onChange={(e) => {
                        const updated = [...attendees];
                        updated[index].name = e.target.value;
                        setAttendees(updated);
                      }}
                      className="w-full border rounded p-2 mb-2"
                    />
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => {
                        const updated = [...attendees];
                        updated[index].sample = e.target.files[0];
                        setAttendees(updated);
                      }}
                      className="w-full"
                    />
                  </div>
                ))}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setAttendees([...attendees, { name: "", sample: null }]);
                  }}
                  className="text-sm text-blue-600 mt-2 underline"
                >
                  + Add Attendee
                </button>
              </div>
            )}
          </>
        )}

        {mode === "record" && (
          <>
            <div className="flex flex-col items-center mb-6 space-y-4 w-full">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition"
                >
                  <MicrophoneIcon className="h-5 w-5" />
                  Start Recording
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded transition"
                >
                  <StopIcon className="h-5 w-5" />
                  Stop Recording
                </button>
              )}
              {audioURL && (
                <div className="mt-4 w-full">
                  <p className="text-gray-600 mb-2">Recorded Audio:</p>
                  <audio controls src={audioURL} className="w-full" />
                  {/* Note markers below audio preview */}
                  {timestampedNotes.length > 0 && (
                    <div className="relative w-full h-6 mt-1 flex items-center">
                      {timestampedNotes.map((note, idx) => {
                        const audio = document.querySelector('audio');
                        const duration = audio ? audio.duration : 1;
                        const percent = duration ? (note.timestamp / duration) * 100 : 0;
                        return (
                          <button
                            key={idx}
                            style={{ left: `${percent}%`, transform: 'translateX(-50%)', position: 'absolute', top: 0 }}
                            className="w-3 h-3 bg-blue-500 rounded-full border-2 border-white shadow hover:bg-blue-700 cursor-pointer pointer-events-auto"
                            title={`Note at ${note.timestamp.toFixed(1)}s`}
                            onClick={() => {
                              setSelectedNote(note);
                              setShowNoteModal(true);
                            }}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="inline-flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={identifySpeakers}
                  onChange={(e) => setIdentifySpeakers(e.target.checked)}
                />
                <span>Identify Speakers</span>
              </label>
            </div>
            {identifySpeakers && (
              <div className="space-y-4 w-full">
                {attendees.map((attendee, index) => (
                  <div key={index} className="border p-4 rounded-md shadow-sm">
                    <label className="block mb-1 font-medium text-sm">Attendee {index + 1}</label>
                    <input
                      type="text"
                      placeholder="Name"
                      value={attendee.name}
                      onChange={(e) => {
                        const updated = [...attendees];
                        updated[index].name = e.target.value;
                        setAttendees(updated);
                      }}
                      className="w-full border rounded p-2 mb-2"
                    />
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => {
                        const updated = [...attendees];
                        updated[index].sample = e.target.files[0];
                        setAttendees(updated);
                      }}
                      className="w-full"
                    />
                  </div>
                ))}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setAttendees([...attendees, { name: "", sample: null }]);
                  }}
                  className="text-sm text-blue-600 mt-2 underline"
                >
                  + Add Attendee
                </button>
              </div>
            )}
          </>
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
          value={meet_attendees}
          onChange={(e) => setMeetAttendees(e.target.value)}
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

        {/* Include notes in transcript checkbox */}
        <div className="flex items-center mb-2">
          <input
            type="checkbox"
            id="includeNotesInTranscript"
            checked={includeNotesInTranscript}
            onChange={e => setIncludeNotesInTranscript(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="includeNotesInTranscript" className="text-md">Include notes in transcript</label>
        </div>
        {mode === "upload" ? (
          <button
            onClick={async () => {
              if (!file) {
                alert("Please upload a file first.");
                return;
              }
              setLoading(true);
              const formData = new FormData();
              formData.append("file", file);
              formData.append("mode", "upload");
              if (identifySpeakers) {
                formData.append("speaker_identification", "true");
                attendees.forEach((attendee) => {
                  formData.append("attendee_names", attendee.name);
                  if (attendee.sample) {
                    formData.append("samples", attendee.sample);
                  }
                });
              }
              try {
                const res = await fetch("http://127.0.0.1:5000/transcribe", {
                  method: "POST",
                  body: formData,
                });
                const data = await res.json();
                let transcriptResult = data.transcript;
                if (includeNotesInTranscript && transcriptResult && timestampedNotes.length > 0) {
                  transcriptResult = insertNotesIntoTranscript(transcriptResult, timestampedNotes);
                }
                if (res.ok) {
                  setTranscript(transcriptResult);
                } else {
                  alert(data.error || "Transcription failed");
                }
              } catch (err) {
                alert("Server error");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className={`w-full p-3 text-white font-bold rounded ${loading ? "bg-gray-400" : "bg-black hover:bg-gray-800"}`}
          >
            {loading ? "Generating..." : "Generate Transcript"}
          </button>
        ) : (
          <button
            onClick={async () => {
              if (!file) {
                alert("Please record audio first.");
                return;
              }
              setLoading(true);
              const formData = new FormData();
              formData.append("file", file);
              formData.append("mode", "record");
              if (identifySpeakers) {
                formData.append("speaker_identification", "true");
                attendees.forEach((attendee) => {
                  formData.append("attendee_names", attendee.name);
                  if (attendee.sample) {
                    formData.append("samples", attendee.sample);
                  }
                });
              }
              try {
                const res = await fetch("http://127.0.0.1:5000/transcribe", {
                  method: "POST",
                  body: formData,
                });
                const data = await res.json();
                let transcriptResult = data.transcript;
                if (includeNotesInTranscript && transcriptResult && timestampedNotes.length > 0) {
                  transcriptResult = insertNotesIntoTranscript(transcriptResult, timestampedNotes);
                }
                if (res.ok) {
                  setTranscript(transcriptResult);
                } else {
                  alert(data.error || "Transcription failed");
                }
              } catch (err) {
                alert("Server error");
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className={`w-full p-3 text-white font-bold rounded ${loading ? "bg-gray-400" : "bg-black hover:bg-gray-800"}`}
          >
            {loading ? "Generating..." : "Get Transcript"}
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
              className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-blue-800"
              disabled={generatingSummary}
            >
              {generatingSummary ? "Generating Summary..." : "Generate Summary"}
            </button>

            <button
              onClick={handleGenerateActionItems}
              className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-blue-800"
              disabled={generatingActions}
            >
              {generatingActions ? "Generating Action Items..." : "Generate Action Items"}
            </button>

            <button
              onClick={handleGenerateMinutes}
              className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-blue-800"
              disabled={generatingMinutes}
            >
              {generatingMinutes ? "Generating Minutes..." : "Generate Minutes"}
            </button>
            <button
              onClick={handleSentimentAnalysis}
              className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-blue-800"
              disabled={analyzingSentiment}
            >
              {analyzingSentiment ? "Analyzing Sentiment..." : "Sentiment Analysis"}
            </button>
            <button
              onClick={handleScoring}
              className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-blue-800"
              disabled={scoring}
            >
              {scoring ? "Scoring..." : "Scoring Mechanism"}
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

        {meetingMinutes && (
          <div className="mt-6 bg-gray-50 p-4 border rounded">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-semibold">Meeting Minutes</h2>
              <div className="mt-2">
                <DownloadButton content={editableMeetingMinutes} filename="meeting_minutes.txt" />
              </div>
            </div>
            <textarea
              value={editableMeetingMinutes}
              onChange={(e) => setEditableMeetingMinutes(e.target.value)}
              className="w-full p-2 border rounded whitespace-pre-wrap"
              rows={15}
            />
          </div>
        )}

        {sentimentResult && (
          <div className="mt-6 bg-gray-50 p-4 border rounded">
            <h2 className="text-xl font-semibold mb-2">Sentiment Analysis</h2>
            <textarea
              value={sentimentResult}
              readOnly
              className="w-full p-2 border rounded whitespace-pre-wrap"
              rows={4}
            />
          </div>
        )}
        {scoringResult && (
          <div className="mt-6 bg-gray-50 p-4 border rounded">
            <h2 className="text-xl font-semibold mb-2">Scoring Mechanism</h2>
            <textarea
              value={scoringResult}
              readOnly
              className="w-full p-2 border rounded whitespace-pre-wrap"
              rows={4}
            />
          </div>
        )}

        {user && (transcript || summary || actionItems || meetingMinutes) && (
          <button
            className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            onClick={async () => {
              try {
                console.log('Saving meeting for user:', user?.id);
                await saveMeetingForUser(user, {
                  title: meetingTitle,
                  date: meetingDate || null,
                  attendees: meet_attendees,
                  agenda: meetingAgenda,
                  transcript: editableTranscript || transcript || transcriptText,
                  summary,
                  action_items: actionItems,
                  minutes: meetingMinutes,
                  sentiment: sentimentResult,
                  score: scoringResult,
                }, file);
                alert('Meeting saved!');
              } catch (err) {
                alert('Error saving meeting: ' + (err.message || JSON.stringify(err)));
              }
            }}
          >
            Save Meeting
          </button>
        )}

        <button
          onClick={() => {
            let ts = null;
            const audio = document.querySelector('audio');
            if ((isRecording || (audio && !audio.paused))) {
              ts = audio ? audio.currentTime : null;
            }
            setNoteTimestamp(ts);
            setNoteInput('');
            setShowNotes(true);
          }}
          className="fixed bottom-10 right-10 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 20h9" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 4h6m-3 0v16M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          Take Notes
        </button>

        {showNotes && (
          <div className="fixed bottom-24 right-8 w-96 bg-white shadow-lg rounded-lg p-4 z-50">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold">Quick Notes</h2>
              <button onClick={() => setShowNotes(false)}>
                <XMarkIcon className="h-5 w-5 text-gray-500 hover:text-gray-700" />
              </button>
            </div>
            {noteTimestamp !== null && (
              <div className="mb-2 text-xs text-gray-500">Timestamp: {noteTimestamp.toFixed(1)}s</div>
            )}
            <textarea
              className="w-full h-32 p-2 border border-gray-300 rounded"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Type your notes here..."
            />
            <button
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded w-full disabled:opacity-50"
              disabled={!noteInput.trim() || !user}
              onClick={async () => {
                if (!user) { alert('You must be logged in to save notes.'); return; }
                const audio = document.querySelector('audio');
                const isAudioActive = isRecording || (audio && !audio.paused);
                if (isAudioActive && noteTimestamp !== null) {
                  setTimestampedNotes((prev) => [...prev, { content: noteInput, timestamp: noteTimestamp }]);
                  // If audio is playing (not recording), also save to DB with audio file name and timestamp
                  if (!isRecording && audio && (file?.name || audioFileNameFromUrl(audioURL))) {
                    try {
                      await saveNoteForUser(user, noteInput, file?.name || audioFileNameFromUrl(audioURL), noteTimestamp);
                    } catch (err) {
                      alert('Error saving note to DB: ' + (err.message || JSON.stringify(err)));
                    }
                  }
                  setShowNotes(false);
                  setNoteInput('');
                  setNoteTimestamp(null);
                } else {
                  try {
                    await saveNoteForUser(user, noteInput);
                    alert('Notes saved!');
                    setShowNotes(false);
                    setNoteInput('');
                  } catch (err) {
                    alert('Error saving notes: ' + (err.message || JSON.stringify(err)));
                  }
                }
              }}
            >
              Save Notes
            </button>
          </div>
        )}

        {/* Note modal for pointer click */}
        {showNoteModal && selectedNote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full relative">
              <button
                className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 text-xl"
                onClick={() => setShowNoteModal(false)}
                aria-label="Close"
              >
                &times;
              </button>
              <div className="mb-2 text-xs text-gray-500">Timestamp: {selectedNote.timestamp.toFixed(1)}s</div>
              <div className="text-lg whitespace-pre-line">{selectedNote.content}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetingMinutesGenerator;
