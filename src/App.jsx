import React, { useState, useEffect, useRef, useCallback } from "react";
import { Peer } from "peerjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle,
  CheckCircle,
  Upload,
  Download,
  Copy,
  Link,
  FileIcon,
  X,
  RefreshCw,
  Wifi,
  WifiOff,
  QrCode,
  Share,
  Moon,
  Sun,
  Files,
  PlusCircle,
  MessageCircle,
  UserPlus,
  Rocket,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { QRCodeCanvas } from "qrcode.react";

// Increase chunk size to 10MB for better performance with large files
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

// Helper function for the theme
const getThemePreference = () => {
  if (typeof window !== "undefined") {
    if (localStorage.getItem("theme")) {
      return localStorage.getItem("theme");
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
};

// Main App component
function App() {
  // State
  const [myPeerId, setMyPeerId] = useState("");
  const [myDisplayName, setMyDisplayName] = useState(
    `Peer-${Math.floor(Math.random() * 1000)}`
  );
  const [sessionName, setSessionName] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [connections, setConnections] = useState([]);
  const [fileQueue, setFileQueue] = useState([]);
  const [currentTransfer, setCurrentTransfer] = useState(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [transferStatus, setTransferStatus] = useState("idle");
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [error, setError] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [theme, setTheme] = useState(getThemePreference());
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  // Refs
  const peerRef = useRef(null);
  const fileInputRef = useRef(null);
  const fileTransferRef = useRef(null);
  const connectionsRef = useRef(new Map());
  const peerNamesRef = useRef(new Map());

  // Set initial theme based on system preference or saved value
  useEffect(() => {
    document.documentElement.className = theme === "dark" ? "dark" : "";
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Initialize PeerJS
  useEffect(() => {
    const peer = new Peer({
      debug: 2,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
        ],
      },
    });

    peer.on("open", (id) => {
      setMyPeerId(id);
      setConnectionStatus("connected"); // The main peer connection is established
      console.log("My peer ID is:", id);

      // Add self to the names map
      peerNamesRef.current.set(id, myDisplayName);

      const urlParams = new URLSearchParams(window.location.search);
      const sessionIdParam = urlParams.get("sessionId");
      if (sessionIdParam && sessionIdParam !== id) {
        connectToSession(sessionIdParam);
      }
    });

    peer.on("connection", (conn) => {
      handleIncomingConnection(conn);
    });

    peer.on("error", (err) => {
      console.error("PeerJS error:", err);
      setError(`Connection error: ${err.message}`);
      setConnectionStatus("error");
    });

    peerRef.current = peer;

    return () => {
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, []);

  // Broadcast name change to all peers
  useEffect(() => {
    if (myPeerId && connections.length > 0) {
      const peerInfo = {
        type: "peer-info",
        peerId: myPeerId,
        displayName: myDisplayName,
      };
      connectionsRef.current.forEach((conn) => {
        if (conn.open) {
          conn.send(peerInfo);
        }
      });
    }
    // Update local name map
    peerNamesRef.current.set(myPeerId, myDisplayName);
  }, [myDisplayName, myPeerId, connections]);

  // Handle incoming connections
  const handleIncomingConnection = (conn) => {
    console.log("Incoming connection from:", conn.peer);

    // Add new connection to the map
    connectionsRef.current.set(conn.peer, conn);
    updateConnectionsState();

    conn.on("open", () => {
      // Send our own info to the new peer
      conn.send({
        type: "peer-info",
        peerId: myPeerId,
        displayName: myDisplayName,
      });
    });

    conn.on("data", (data) => handleReceivedData(conn.peer, data));

    conn.on("close", () => {
      console.log("Connection closed with:", conn.peer);
      connectionsRef.current.delete(conn.peer);
      peerNamesRef.current.delete(conn.peer); // Remove name on close
      updateConnectionsState();
    });

    conn.on("error", (err) => {
      console.error("Connection error with peer:", conn.peer, err);
      setError(`Connection error with ${conn.peer}: ${err.message}`);
      connectionsRef.current.delete(conn.peer);
      peerNamesRef.current.delete(conn.peer); // Remove name on error
      updateConnectionsState();
    });
  };

  // Connect to a remote session (peer ID)
  const connectToSession = useCallback(
    (sessionId) => {
      if (!sessionId || connectionsRef.current.has(sessionId)) {
        setError("Please enter a valid, new session ID");
        return;
      }

      setError("");
      setSessionName(sessionId);

      try {
        const conn = peerRef.current.connect(sessionId, {
          reliable: true,
        });

        const connectionTimeout = setTimeout(() => {
          if (!connectionsRef.current.has(sessionId)) {
            setError("Connection timed out. Please try again.");
            conn.close();
          }
        }, 15000);

        conn.on("open", () => {
          clearTimeout(connectionTimeout);
          connectionsRef.current.set(sessionId, conn);
          updateConnectionsState();
          console.log(
            "Connection established successfully with session:",
            sessionId
          );
          setSessionName(""); // Clear the input after successful connection

          // Send our own info
          conn.send({
            type: "peer-info",
            peerId: myPeerId,
            displayName: myDisplayName,
          });

          conn.on("data", (data) => handleReceivedData(conn.peer, data));

          conn.on("close", () => {
            console.log("Connection closed with:", conn.peer);
            connectionsRef.current.delete(conn.peer);
            peerNamesRef.current.delete(conn.peer); // Remove name on close
            updateConnectionsState();
          });

          conn.on("error", (err) => {
            console.error("Connection error with peer:", conn.peer, err);
            setError(`Connection error with ${conn.peer}: ${err.message}`);
            connectionsRef.current.delete(conn.peer);
            peerNamesRef.current.delete(conn.peer); // Remove name on error
            updateConnectionsState();
          });
        });

        conn.on("error", (err) => {
          clearTimeout(connectionTimeout);
          console.error("Connection error:", err);
          setError(`Connection error: ${err.message}`);
        });
      } catch (err) {
        console.error("Failed to connect:", err);
        setError(`Failed to connect: ${err.message}`);
      }
    },
    [myPeerId, myDisplayName]
  );

  // Helper to update connections state
  const updateConnectionsState = () => {
    setConnections(Array.from(connectionsRef.current.keys()));
  };

  // Watch for connection status changes to start the transfer queue
  useEffect(() => {
    if (connections.length > 0 && fileQueue.length > 0 && !currentTransfer) {
      startTransfer();
    }
  }, [connections, fileQueue, currentTransfer]);

  // Handle file selection (input and drag-and-drop)
  const handleFileSelect = (files) => {
    const newFiles = Array.from(files).map((file) => ({
      id: Date.now() + Math.random(),
      file,
      status: "pending",
      progress: 0,
    }));
    setFileQueue((prev) => [...prev, ...newFiles]);
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files);
    }
  };

  // Remove a file from the queue
  const removeFileFromQueue = (id) => {
    setFileQueue((prev) => prev.filter((file) => file.id !== id));
  };

  // Start the transfer process from the queue
  const startTransfer = useCallback(async () => {
    if (
      currentTransfer ||
      fileQueue.length === 0 ||
      connectionsRef.current.size === 0
    ) {
      return;
    }

    const nextFileToTransfer = fileQueue[0];
    setCurrentTransfer(nextFileToTransfer);
    setFileQueue((prev) => prev.slice(1));

    const file = nextFileToTransfer.file;
    setTransferStatus("sending");
    setTransferProgress(0);
    setError("");

    try {
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const metadata = {
        type: "file-metadata",
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        totalChunks: totalChunks,
        senderId: myPeerId,
      };

      // Send metadata to all connected peers
      connectionsRef.current.forEach((conn) => {
        if (conn.open) {
          conn.send(metadata);
        }
      });

      const connectionsArray = Array.from(connectionsRef.current.values());

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            connectionsArray.forEach((conn) => {
              if (conn.open) {
                conn.send({
                  type: "file-chunk",
                  chunk: e.target.result,
                  index: chunkIndex,
                  totalChunks: totalChunks,
                });
              }
            });
            const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
            setTransferProgress(progress);
            resolve();
          };
          reader.onerror = reject;
          reader.readAsArrayBuffer(chunk);
        });
      }
      setTransferStatus("sent");
    } catch (err) {
      console.error("Error sending file:", err);
      setError(`Error sending file: ${err.message}`);
      setTransferStatus("error");
    } finally {
      setCurrentTransfer(null);
      setTimeout(() => setTransferStatus("idle"), 3000);
    }
  }, [fileQueue, currentTransfer, myPeerId]);

  // Handle received data with improved large file handling
  const handleReceivedData = (peerId, data) => {
    if (data.type === "peer-info") {
      // Update the name map with the new peer's info
      peerNamesRef.current.set(data.peerId, data.displayName);
      updateConnectionsState();
    } else if (data.type === "chat-message") {
      setChatMessages((prev) => [
        ...prev,
        {
          senderId: data.senderId,
          message: data.message,
          timestamp: data.timestamp,
        },
      ]);
    } else if (data.type === "file-metadata") {
      fileTransferRef.current = {
        metadata: data,
        chunks: [],
        receivedSize: 0,
      };
      setTransferStatus("receiving");
      setTransferProgress(0);
    } else if (data.type === "file-chunk") {
      if (!fileTransferRef.current) {
        console.error("Received chunk without metadata");
        return;
      }

      fileTransferRef.current.chunks.push(new Blob([data.chunk]));
      fileTransferRef.current.receivedSize += data.chunk.byteLength;

      const progress = Math.round(
        (fileTransferRef.current.receivedSize /
          fileTransferRef.current.metadata.fileSize) *
          100
      );
      setTransferProgress(progress);

      if (
        fileTransferRef.current.chunks.length ===
        fileTransferRef.current.metadata.totalChunks
      ) {
        const receivedBlob = new Blob(fileTransferRef.current.chunks, {
          type: fileTransferRef.current.metadata.fileType,
        });
        const receivedFile = {
          id: Date.now(),
          name: fileTransferRef.current.metadata.fileName,
          type: fileTransferRef.current.metadata.fileType,
          size: fileTransferRef.current.metadata.fileSize,
          blob: receivedBlob,
          url: URL.createObjectURL(receivedBlob),
          senderId: fileTransferRef.current.metadata.senderId,
        };
        setReceivedFiles((prev) => [...prev, receivedFile]);
        setTransferStatus("received");
        setTimeout(() => {
          setTransferStatus("idle");
          setTransferProgress(0);
        }, 3000);
        fileTransferRef.current = null;
      }
    }
  };

  // Handle sending chat messages
  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || connections.length === 0) return;

    const messagePayload = {
      type: "chat-message",
      senderId: myPeerId,
      message: chatInput,
      timestamp: Date.now(),
    };

    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.send(messagePayload);
      }
    });

    // Add own message to local state
    setChatMessages((prev) => [...prev, messagePayload]);
    setChatInput("");
  };

  // Copy peer ID to clipboard
  const copyPeerId = () => {
    navigator.clipboard.writeText(myPeerId);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Generate shareable link with peer ID
  const generateShareableLink = () => {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?sessionId=${myPeerId}`;
  };

  // Copy shareable link to clipboard
  const copyShareableLink = () => {
    navigator.clipboard.writeText(generateShareableLink());
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
  };

  // Disconnect from peer
  const disconnect = () => {
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        conn.close();
      }
    });
    connectionsRef.current.clear();
    peerNamesRef.current.clear();
    peerNamesRef.current.set(myPeerId, myDisplayName); // Keep our own name
    updateConnectionsState();
  };

  // Remove a received file
  const removeReceivedFile = (id) => {
    setReceivedFiles((prev) => {
      const updatedFiles = prev.filter((file) => file.id !== id);
      const fileToRemove = prev.find((file) => file.id === id);
      if (fileToRemove && fileToRemove.url) {
        URL.revokeObjectURL(fileToRemove.url);
      }
      return updatedFiles;
    });
  };

  // Status information
  const getStatusInfo = () => {
    switch (connectionStatus) {
      case "connected":
        return {
          icon:
            connections.length > 0 ? (
              <Rocket className="h-5 w-5 text-blue-500 animate-bounce" />
            ) : (
              <Wifi className="h-5 w-5 text-green-500" />
            ),
          color: connections.length > 0 ? "bg-blue-500" : "bg-green-500",
          text: "Online",
          description: "Your peer is online",
        };
      case "connecting":
        return {
          icon: <RefreshCw className="h-5 w-5 text-yellow-500 animate-spin" />,
          color: "bg-yellow-500",
          text: "Connecting",
          description: "Establishing connection...",
        };
      case "disconnected":
        return {
          icon: <WifiOff className="h-5 w-5 text-gray-500" />,
          color: "bg-gray-500",
          text: "Offline",
          description: "Your peer is offline",
        };
      case "error":
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-500" />,
          color: "bg-red-500",
          text: "Error",
          description: "Connection error occurred",
        };
      default:
        return {
          icon: <WifiOff className="h-5 w-5 text-gray-500" />,
          color: "bg-gray-500",
          text: "Offline",
          description: "Your peer is offline",
        };
    }
  };

  // File size formatter
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " bytes";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    else return (bytes / 1073741824).toFixed(1) + " GB";
  };

  // Get file icon based on mime type
  const getFileIcon = (type) => {
    if (type.startsWith("image/")) return "🖼️";
    if (type.startsWith("video/")) return "🎬";
    if (type.startsWith("audio/")) return "🎵";
    if (type.startsWith("text/")) return "📄";
    if (type.includes("pdf")) return "📑";
    if (type.includes("zip") || type.includes("rar") || type.includes("tar"))
      return "🗜️";
    return "📁";
  };

  // Check if a file is an image for preview
  const isImage = (file) => file.type.startsWith("image/");

  // Status information
  const statusInfo = getStatusInfo();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-50 font-sans antialiased">
      <div className="container mx-auto py-8 px-4 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
            P2P Collaboration Hub
          </h1>
          <div className="flex items-center gap-2 sm:gap-4 mt-4 sm:mt-0">
            <Badge
              variant={connections.length > 0 ? "default" : "secondary"}
              className={`px-3 py-1 flex items-center gap-2 transition-all duration-300 ${
                connections.length > 0 ? "bg-blue-500 hover:bg-blue-600" : ""
              }`}
            >
              {statusInfo.icon}
              {connections.length > 0
                ? `Group Session (${connections.length} peers)`
                : statusInfo.text}
            </Badge>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-full transition-colors duration-300"
            >
              {theme === "dark" ? (
                <Sun className="h-[1.2rem] w-[1.2rem] transition-transform duration-300 rotate-0 scale-100 dark:-rotate-90 dark:scale-0" />
              ) : (
                <Moon className="h-[1.2rem] w-[1.2rem] transition-transform duration-300 rotate-90 scale-0 dark:rotate-0 dark:scale-100" />
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Connection Panel */}
          <Card className="shadow-md border-0 bg-white dark:bg-gray-800 lg:col-span-1 transition-shadow duration-300 hover:shadow-xl">
            <CardHeader className="bg-gray-50 dark:bg-gray-800 rounded-t-lg">
              <CardTitle className="flex items-center gap-2">
                <Link className="h-5 w-5 text-blue-500" />
                Session Management
              </CardTitle>
              <CardDescription>{statusInfo.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="mb-4">
                <label
                  htmlFor="display-name"
                  className="block mb-2 text-sm font-medium"
                >
                  Your Display Name
                </label>
                <Input
                  id="display-name"
                  value={myDisplayName}
                  onChange={(e) => setMyDisplayName(e.target.value)}
                  placeholder="Enter a display name"
                  className="font-sans text-sm dark:bg-gray-700"
                />
              </div>
              <div className="mb-6">
                <label className="block mb-2 text-sm font-medium">
                  Your Session ID
                </label>
                <div className="flex gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          value={myPeerId}
                          readOnly
                          className="font-mono text-sm dark:bg-gray-700"
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Share this ID with others to join your session</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    variant="outline"
                    onClick={copyPeerId}
                    className={`transition-colors duration-200 ${
                      copySuccess
                        ? "bg-green-50 text-green-600 dark:bg-green-900 dark:text-green-300"
                        : ""
                    }`}
                  >
                    {copySuccess ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowQrDialog(true)}
                    className="text-blue-600 dark:text-blue-400"
                  >
                    <QrCode className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mb-6">
                <label className="block mb-2 text-sm font-medium">
                  Join a Session
                </label>
                <div className="flex gap-2">
                  <Input
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="Enter a session ID to join"
                    className="font-mono text-sm dark:bg-gray-700"
                  />
                  <Button
                    onClick={() => connectToSession(sessionName)}
                    disabled={!sessionName}
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {connections.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-2">
                    Connected Peers ({connections.length})
                  </h3>
                  <div className="space-y-2 max-h-24 overflow-y-auto">
                    {connections.map((peerId) => (
                      <Badge
                        key={peerId}
                        variant="outline"
                        className="w-full justify-center transition-transform duration-300 hover:scale-[1.02]"
                      >
                        <span className="font-sans text-xs">
                          {peerNamesRef.current.get(peerId) || peerId}
                        </span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <Alert variant="destructive" className="mb-6 animate-pulse">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className="flex justify-between bg-gray-50 dark:bg-gray-800 rounded-b-lg">
              {connections.length > 0 ? (
                <Button
                  variant="destructive"
                  onClick={disconnect}
                  className="w-full transition-transform duration-200 hover:scale-[1.01]"
                >
                  <WifiOff className="mr-2 h-4 w-4" />
                  Disconnect from all
                </Button>
              ) : (
                <Button className="w-full" disabled>
                  <WifiOff className="mr-2 h-4 w-4" />
                  No peers connected
                </Button>
              )}
            </CardFooter>
          </Card>

          {/* File Transfer Panel */}
          <Card className="shadow-md border-0 bg-white dark:bg-gray-800 transition-shadow duration-300 hover:shadow-xl">
            <CardHeader className="bg-gray-50 dark:bg-gray-800 rounded-t-lg">
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-blue-500" />
                Send Files
              </CardTitle>
              <CardDescription>
                Share files with all connected peers
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div
                className={`w-full border-dashed border-2 rounded-lg h-24 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors duration-300 ${
                  isDragOver
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900"
                    : "border-gray-300 dark:border-gray-600"
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current.click()}
              >
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                />
                <Files className="h-6 w-6 text-gray-400" />
                <span className="text-gray-500 dark:text-gray-400">
                  Drag and drop files here or click to select
                </span>
              </div>

              {fileQueue.length > 0 && (
                <div className="mt-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-700 transition-all duration-300">
                  <h3 className="font-semibold text-sm mb-2">
                    Transfer Queue ({fileQueue.length} files)
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {fileQueue.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 bg-white dark:bg-gray-800 p-2 rounded-md transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <div className="text-xl">
                          {getFileIcon(item.file.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm">
                            {item.file.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatFileSize(item.file.size)}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-80 hover:opacity-100"
                          onClick={() => removeFileFromQueue(item.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(transferStatus === "sending" ||
                transferStatus === "receiving") && (
                <div className="mt-6 transition-opacity duration-300">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm capitalize">
                        {transferStatus === "sending" ? "Sending" : "Receiving"}
                        ...
                      </span>
                      {currentTransfer && (
                        <span className="text-sm font-medium truncate max-w-[150px] md:max-w-none">
                          ({currentTransfer.file.name})
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-medium">
                      {transferProgress}%
                    </span>
                  </div>
                  <Progress
                    value={transferProgress}
                    className="h-2"
                    indicatorClassName={
                      transferStatus === "sending"
                        ? "bg-gradient-to-r from-blue-500 to-indigo-600"
                        : "bg-gradient-to-r from-green-500 to-emerald-600"
                    }
                  />
                </div>
              )}

              {transferStatus === "sent" && (
                <Alert
                  variant="success"
                  className="mt-6 bg-green-50 border-green-200 text-green-800 dark:bg-green-900 dark:border-green-800 dark:text-green-300 animate-fade-in"
                >
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertTitle>Success</AlertTitle>
                  <AlertDescription>File sent successfully!</AlertDescription>
                </Alert>
              )}

              {transferStatus === "received" && (
                <Alert
                  variant="success"
                  className="mt-6 bg-green-50 border-green-200 text-green-800 dark:bg-green-900 dark:border-green-800 dark:text-green-300 animate-fade-in"
                >
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertTitle>Success</AlertTitle>
                  <AlertDescription>
                    File received successfully!
                  </AlertDescription>
                </Alert>
              )}

              {transferStatus === "error" && (
                <Alert variant="destructive" className="mt-6 animate-fade-in">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    File transfer failed. Please try again.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className="bg-gray-50 dark:bg-gray-800 rounded-b-lg">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-full">
                      <Button
                        onClick={startTransfer}
                        disabled={
                          fileQueue.length === 0 ||
                          connections.length === 0 ||
                          transferStatus === "sending" ||
                          currentTransfer !== null
                        }
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 dark:from-blue-500 dark:to-indigo-500 dark:hover:from-blue-600 dark:hover:to-indigo-600 transition-all duration-200 hover:scale-[1.01]"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {transferStatus === "sending"
                          ? "Sending..."
                          : `Send ${
                              fileQueue.length > 0 ? fileQueue.length : ""
                            } Files`}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {fileQueue.length === 0
                      ? "Select files first"
                      : connections.length === 0
                      ? "Connect to a session first"
                      : ""}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardFooter>
          </Card>

          {/* Received Files & Chat Panel */}
          <div className="flex flex-col gap-6 lg:col-span-1">
            <Card className="shadow-md border-0 bg-white dark:bg-gray-800 flex-1 transition-shadow duration-300 hover:shadow-xl">
              <CardHeader className="bg-gray-50 dark:bg-gray-800 rounded-t-lg">
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-blue-500" />
                  Received Files
                </CardTitle>
                <CardDescription>
                  Files you've received from peers
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {receivedFiles.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400 transition-opacity duration-300">
                    <FileIcon className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-2" />
                    <p>No files received yet</p>
                    <p className="text-sm mt-1">
                      Files you receive will appear here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-56 overflow-y-auto pr-2">
                    {receivedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="p-4 border rounded-lg flex flex-col sm:flex-row items-start sm:items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 group transition-all duration-200"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="text-2xl">
                            {getFileIcon(file.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{file.name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              <span className="font-bold mr-1">From:</span>
                              {peerNamesRef.current.get(file.senderId) ||
                                file.senderId}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {formatFileSize(file.size)}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2 sm:mt-0">
                          {isImage(file) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <img
                                    src={file.url}
                                    alt="Preview"
                                    className="h-10 w-10 object-cover rounded-md cursor-pointer transition-transform duration-200 hover:scale-110"
                                  />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <img
                                    src={file.url}
                                    alt="Preview"
                                    className="max-h-64 max-w-64"
                                  />
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 dark:text-gray-300 dark:hover:bg-gray-600"
                            onClick={() => removeReceivedFile(file.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <a
                            href={file.url}
                            download={file.name}
                            className="inline-flex"
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              className="dark:text-gray-300 dark:hover:bg-gray-600"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-md border-0 bg-white dark:bg-gray-800 flex-1 transition-shadow duration-300 hover:shadow-xl">
              <CardHeader className="bg-gray-50 dark:bg-gray-800 rounded-t-lg">
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-blue-500" />
                  Group Chat
                </CardTitle>
                <CardDescription>Chat with all connected peers</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 flex flex-col h-full">
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 mb-4 max-h-56">
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
                      No messages yet. Say hello!
                    </div>
                  ) : (
                    chatMessages.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex transition-transform duration-300 ${
                          msg.senderId === myPeerId
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`p-3 rounded-lg max-w-[70%] text-sm ${
                            msg.senderId === myPeerId
                              ? "bg-blue-500 text-white"
                              : "bg-gray-200 dark:bg-gray-700 dark:text-white"
                          }`}
                        >
                          <div className="font-bold text-xs mb-1">
                            {peerNamesRef.current.get(msg.senderId) ||
                              "Unknown Peer"}
                          </div>
                          <div>{msg.message}</div>
                          <div className="text-right text-xs mt-1 opacity-75">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <form onSubmit={sendChatMessage} className="flex gap-2 mt-auto">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    disabled={connections.length === 0}
                    className="dark:bg-gray-700"
                  />
                  <Button
                    type="submit"
                    disabled={!chatInput.trim() || connections.length === 0}
                    className="transition-transform duration-200 hover:scale-[1.01]"
                  >
                    Send
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-10 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            Secure P2P transfers directly between browsers. No data is stored on
            servers.
          </p>
        </div>

        {/* QR Code Dialog */}
        <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50">
            <DialogHeader>
              <DialogTitle>Share Your Session</DialogTitle>
              <DialogDescription>
                Scan this QR code or share the link to invite others
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center justify-center py-4">
              <div className="bg-white p-4 rounded-lg mb-4">
                <QRCodeCanvas value={generateShareableLink()} size={200} />
              </div>
              <div className="flex w-full items-center space-x-2 mb-2">
                <Input
                  value={generateShareableLink()}
                  readOnly
                  className="font-mono text-sm dark:bg-gray-700"
                />
                <Button
                  variant="outline"
                  className={`transition-colors duration-200 ${
                    shareLinkCopied
                      ? "bg-green-50 text-green-600 dark:bg-green-900 dark:text-green-300"
                      : ""
                  }`}
                  onClick={copyShareableLink}
                >
                  {shareLinkCopied ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-2">
                Anyone with this link or QR code can join your session.
              </p>
            </div>
            <DialogClose asChild>
              <Button
                variant="outline"
                className="w-full dark:hover:bg-gray-700"
              >
                Done
              </Button>
            </DialogClose>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default App;
