// src/App.jsx
import React, { useState, useEffect, useRef } from "react";
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
} from "lucide-react";

function App() {
  // State
  const [myPeerId, setMyPeerId] = useState("");
  const [remotePeerId, setRemotePeerId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [selectedFile, setSelectedFile] = useState(null);
  const [transferProgress, setTransferProgress] = useState(0);
  const [transferStatus, setTransferStatus] = useState("idle");
  const [receivedFiles, setReceivedFiles] = useState([]);
  const [error, setError] = useState("");

  // Refs
  const peerRef = useRef(null);
  const connectionRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize PeerJS
  useEffect(() => {
    const peer = new Peer({
      debug: 2,
    });

    peer.on("open", (id) => {
      setMyPeerId(id);
      console.log("My peer ID is:", id);
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

  // Handle incoming connections
  const handleIncomingConnection = (conn) => {
    connectionRef.current = conn;
    setConnectionStatus("connected");
    setRemotePeerId(conn.peer);

    conn.on("data", handleReceivedData);

    conn.on("close", () => {
      setConnectionStatus("disconnected");
      connectionRef.current = null;
    });

    conn.on("error", (err) => {
      console.error("Connection error:", err);
      setError(`Connection error: ${err.message}`);
      setConnectionStatus("error");
    });
  };

  // Connect to remote peer
  const connectToPeer = () => {
    if (!remotePeerId) return;

    setError("");
    setConnectionStatus("connecting");

    try {
      const conn = peerRef.current.connect(remotePeerId, {
        reliable: true,
      });

      conn.on("open", () => {
        connectionRef.current = conn;
        setConnectionStatus("connected");

        conn.on("data", handleReceivedData);

        conn.on("close", () => {
          setConnectionStatus("disconnected");
          connectionRef.current = null;
        });
      });

      conn.on("error", (err) => {
        console.error("Connection error:", err);
        setError(`Connection error: ${err.message}`);
        setConnectionStatus("error");
      });
    } catch (err) {
      console.error("Failed to connect:", err);
      setError(`Failed to connect: ${err.message}`);
      setConnectionStatus("error");
    }
  };

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  // Send file to connected peer
  const sendFile = () => {
    if (
      !selectedFile ||
      !connectionRef.current ||
      connectionStatus !== "connected"
    ) {
      return;
    }

    setTransferStatus("sending");
    setTransferProgress(0);

    // Read file as array buffer
    const reader = new FileReader();

    reader.onload = (e) => {
      const fileData = e.target.result;
      const fileName = selectedFile.name;
      const fileType = selectedFile.type;
      const fileSize = selectedFile.size;

      // Chunk size (1MB)
      const chunkSize = 1024 * 1024;
      const chunks = Math.ceil(fileData.byteLength / chunkSize);

      // Send file metadata first
      connectionRef.current.send({
        type: "file-metadata",
        fileName,
        fileType,
        fileSize,
        chunks,
      });

      // Send file chunks
      for (let i = 0; i < chunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(fileData.byteLength, start + chunkSize);
        const chunk = fileData.slice(start, end);

        connectionRef.current.send({
          type: "file-chunk",
          chunk,
          index: i,
          total: chunks,
        });

        // Update progress (simulated as we can't track actual sending progress)
        const progress = Math.round(((i + 1) / chunks) * 100);
        setTransferProgress(progress);
      }

      // Indicate completion
      setTransferStatus("sent");
      setTimeout(() => {
        setTransferStatus("idle");
        setTransferProgress(0);
      }, 3000);
    };

    reader.onerror = (err) => {
      console.error("Error reading file:", err);
      setError(`Error reading file: ${err}`);
      setTransferStatus("error");
    };

    reader.readAsArrayBuffer(selectedFile);
  };

  // Handle received data (metadata and chunks)
  const handleReceivedData = (data) => {
    if (data.type === "file-metadata") {
      // Initialize a new file reception
      setTransferStatus("receiving");
      setTransferProgress(0);

      window.currentFileTransfer = {
        metadata: data,
        chunks: new Array(data.chunks),
        receivedChunks: 0,
        buffer: new ArrayBuffer(data.fileSize),
      };
    } else if (data.type === "file-chunk") {
      // Process received chunk
      const fileTransfer = window.currentFileTransfer;

      if (!fileTransfer) {
        console.error("Received chunk without metadata");
        return;
      }

      // Store the chunk data
      const view = new Uint8Array(fileTransfer.buffer);
      const chunkData = new Uint8Array(data.chunk);

      const chunkSize = 1024 * 1024; // 1MB, same as sender
      const start = data.index * chunkSize;

      view.set(chunkData, start);

      fileTransfer.chunks[data.index] = true;
      fileTransfer.receivedChunks++;

      // Update progress
      const progress = Math.round(
        (fileTransfer.receivedChunks / data.total) * 100
      );
      setTransferProgress(progress);

      // Check if all chunks received
      if (fileTransfer.receivedChunks === data.total) {
        // Create file from the received data
        const fileBlob = new Blob([fileTransfer.buffer], {
          type: fileTransfer.metadata.fileType,
        });

        // Update UI
        setReceivedFiles((prev) => [
          ...prev,
          {
            id: Date.now(),
            name: fileTransfer.metadata.fileName,
            type: fileTransfer.metadata.fileType,
            size: fileTransfer.metadata.fileSize,
            blob: fileBlob,
            url: URL.createObjectURL(fileBlob),
          },
        ]);

        setTransferStatus("received");
        setTimeout(() => {
          setTransferStatus("idle");
          setTransferProgress(0);
        }, 3000);

        // Clean up
        delete window.currentFileTransfer;
      }
    }
  };

  // Copy peer ID to clipboard
  const copyPeerId = () => {
    navigator.clipboard.writeText(myPeerId);
  };

  // Disconnect from peer
  const disconnect = () => {
    if (connectionRef.current) {
      connectionRef.current.close();
    }
    setConnectionStatus("disconnected");
    connectionRef.current = null;
  };

  // Status colors
  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return "bg-green-500";
      case "connecting":
        return "bg-yellow-500";
      case "disconnected":
        return "bg-gray-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  // File size formatter
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " bytes";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    else return (bytes / 1073741824).toFixed(1) + " GB";
  };

  return (
    <div className='container mx-auto p-4'>
      <h1 className='text-2xl font-bold mb-6'>P2P File Transfer</h1>

      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        {/* Connection Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Connection</CardTitle>
            <CardDescription>
              Connect with another peer to start sharing files
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='mb-4'>
              <label className='block mb-2 text-sm font-medium'>
                Your Peer ID
              </label>
              <div className='flex gap-2'>
                <Input value={myPeerId} readOnly />
                <Button variant='outline' onClick={copyPeerId}>
                  <Copy className='h-4 w-4' />
                </Button>
              </div>
            </div>

            <div className='mb-4'>
              <label className='block mb-2 text-sm font-medium'>
                Remote Peer ID
              </label>
              <div className='flex gap-2'>
                <Input
                  value={remotePeerId}
                  onChange={(e) => setRemotePeerId(e.target.value)}
                  disabled={connectionStatus === "connected"}
                  placeholder='Enter peer ID to connect'
                />
              </div>
            </div>

            <div className='flex items-center gap-2 mb-4'>
              <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
              <span className='capitalize'>{connectionStatus}</span>
            </div>

            {error && (
              <div className='flex items-center gap-2 text-red-500 mb-4'>
                <AlertCircle className='h-4 w-4' />
                <span>{error}</span>
              </div>
            )}
          </CardContent>
          <CardFooter className='flex justify-between'>
            {connectionStatus !== "connected" ? (
              <Button
                onClick={connectToPeer}
                disabled={!remotePeerId || connectionStatus === "connecting"}
              >
                <Link className='mr-2 h-4 w-4' />
                Connect
              </Button>
            ) : (
              <Button variant='destructive' onClick={disconnect}>
                Disconnect
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* File Transfer Panel */}
        <Card>
          <CardHeader>
            <CardTitle>File Transfer</CardTitle>
            <CardDescription>Send files to connected peer</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='mb-4'>
              <input
                type='file'
                ref={fileInputRef}
                onChange={handleFileSelect}
                className='hidden'
              />
              <Button
                variant='outline'
                className='w-full'
                onClick={() => fileInputRef.current.click()}
                disabled={connectionStatus !== "connected"}
              >
                Choose File
              </Button>
            </div>

            {selectedFile && (
              <div className='mb-4 p-3 border rounded'>
                <p className='font-medium'>{selectedFile.name}</p>
                <p className='text-sm text-gray-500'>
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            )}

            {(transferStatus === "sending" ||
              transferStatus === "receiving") && (
              <div className='mb-4'>
                <p className='mb-2 capitalize'>
                  {transferStatus} file... {transferProgress}%
                </p>
                <Progress value={transferProgress} className='h-2' />
              </div>
            )}

            {transferStatus === "sent" && (
              <div className='flex items-center gap-2 text-green-500 mb-4'>
                <CheckCircle className='h-4 w-4' />
                <span>File sent successfully!</span>
              </div>
            )}

            {transferStatus === "received" && (
              <div className='flex items-center gap-2 text-green-500 mb-4'>
                <CheckCircle className='h-4 w-4' />
                <span>File received successfully!</span>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button
              onClick={sendFile}
              disabled={
                !selectedFile ||
                connectionStatus !== "connected" ||
                transferStatus === "sending"
              }
              className='w-full'
            >
              <Upload className='mr-2 h-4 w-4' />
              Send File
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* Received Files */}
      {receivedFiles.length > 0 && (
        <Card className='mt-6'>
          <CardHeader>
            <CardTitle>Received Files</CardTitle>
            <CardDescription>Files you've received from peers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-3'>
              {receivedFiles.map((file) => (
                <div
                  key={file.id}
                  className='p-3 border rounded flex justify-between items-center'
                >
                  <div>
                    <p className='font-medium'>{file.name}</p>
                    <p className='text-sm text-gray-500'>
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  <a
                    href={file.url}
                    download={file.name}
                    className='inline-flex items-center'
                  >
                    <Button>
                      <Download className='mr-2 h-4 w-4' />
                      Download
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default App;
