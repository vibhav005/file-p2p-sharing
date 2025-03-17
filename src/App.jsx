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
  FileIcon,
  X,
  RefreshCw,
  Wifi,
  WifiOff,
  QrCode, // Added QR code icon
  Share, // Added share icon
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
} from "@/components/ui/dialog"; // Import Dialog components
import { QRCodeCanvas } from "qrcode.react";

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
  const [copySuccess, setCopySuccess] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false); // State for QR code dialog
  const [shareLinkCopied, setShareLinkCopied] = useState(false); // State for share link copy success

  // Refs
  const peerRef = useRef(null);
  const connectionRef = useRef(null);
  const fileInputRef = useRef(null);

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
      console.log("My peer ID is:", id);

      // Check if URL contains a peer ID to connect to
      const urlParams = new URLSearchParams(window.location.search);
      const peerIdParam = urlParams.get("peerId");
      if (peerIdParam && peerIdParam !== id) {
        setRemotePeerId(peerIdParam);
        // Optional: auto-connect if ID is provided in URL
        // setTimeout(() => connectToPeer(peerIdParam), 1000);
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
  const connectToPeer = (peerIdToConnect) => {
    const idToConnect = peerIdToConnect || remotePeerId;
    if (!idToConnect) {
      setError("Please enter a remote peer ID");
      return;
    }

    // Clear any previous errors and set connecting status
    setError("");
    setConnectionStatus("connecting");

    try {
      // Check if we already have a connection and close it
      if (connectionRef.current) {
        connectionRef.current.close();
        connectionRef.current = null;
      }

      // Create a new connection
      const conn = peerRef.current.connect(idToConnect, {
        reliable: true,
      });

      // Set a timeout for connection attempts
      const connectionTimeout = setTimeout(() => {
        if (connectionStatus !== "connected") {
          setError("Connection timed out. Please try again.");
          setConnectionStatus("error");
          conn.close();
        }
      }, 15000); // 15 seconds timeout

      conn.on("open", () => {
        clearTimeout(connectionTimeout);
        connectionRef.current = conn;
        setConnectionStatus("connected");
        console.log("Connection established successfully");

        conn.on("data", handleReceivedData);

        conn.on("close", () => {
          console.log("Connection closed");
          setConnectionStatus("disconnected");
          connectionRef.current = null;
        });
      });

      conn.on("error", (err) => {
        clearTimeout(connectionTimeout);
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

  // Clear selected file
  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Send file to connected peer
  const sendFile = () => {
    if (!selectedFile) {
      setError("No file selected");
      return;
    }

    if (!connectionRef.current) {
      setError("No active connection");
      return;
    }

    if (connectionStatus !== "connected") {
      setError(
        "Connection is not open. Please wait for the connection to be fully established."
      );
      return;
    }

    // Check if the connection is actually ready for data
    if (connectionRef.current.open === false) {
      setError(
        "Connection is not fully open yet. Please try again in a moment."
      );
      return;
    }

    setTransferStatus("sending");
    setTransferProgress(0);
    setError(""); // Clear any previous errors

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

      try {
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
      } catch (err) {
        console.error("Error sending file:", err);
        setError(`Error sending file: ${err.message}`);
        setTransferStatus("error");
      }
    };

    reader.onerror = (err) => {
      console.error("Error reading file:", err);
      setError(`Error reading file: ${err.message}`);
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
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Generate shareable link with peer ID
  const generateShareableLink = () => {
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}?peerId=${myPeerId}`;
  };

  // Copy shareable link to clipboard
  const copyShareableLink = () => {
    navigator.clipboard.writeText(generateShareableLink());
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
  };

  // Disconnect from peer
  const disconnect = () => {
    if (connectionRef.current) {
      connectionRef.current.close();
    }
    setConnectionStatus("disconnected");
    connectionRef.current = null;
  };

  // Remove a received file
  const removeReceivedFile = (id) => {
    setReceivedFiles((prev) => {
      const updatedFiles = prev.filter((file) => file.id !== id);

      // Revoke object URL to prevent memory leaks
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
          icon: <Wifi className='h-5 w-5 text-green-500' />,
          color: "bg-green-500",
          text: "Connected",
          description: "Connected to peer",
        };
      case "connecting":
        return {
          icon: <RefreshCw className='h-5 w-5 text-yellow-500 animate-spin' />,
          color: "bg-yellow-500",
          text: "Connecting",
          description: "Establishing connection...",
        };
      case "disconnected":
        return {
          icon: <WifiOff className='h-5 w-5 text-gray-500' />,
          color: "bg-gray-500",
          text: "Disconnected",
          description: "Not connected to any peer",
        };
      case "error":
        return {
          icon: <AlertCircle className='h-5 w-5 text-red-500' />,
          color: "bg-red-500",
          text: "Error",
          description: "Connection error occurred",
        };
      default:
        return {
          icon: <WifiOff className='h-5 w-5 text-gray-500' />,
          color: "bg-gray-500",
          text: "Disconnected",
          description: "Not connected to any peer",
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

  // Status information
  const statusInfo = getStatusInfo();

  return (
    <div className='min-h-screen bg-gray-50 dark:bg-gray-900'>
      <div className='container mx-auto py-8 px-4'>
        <div className='flex justify-between items-center mb-8'>
          <h1 className='text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent'>
            Secure P2P File Transfer
          </h1>
          <Badge
            variant={connectionStatus === "connected" ? "success" : "secondary"}
            className='px-3 py-1 flex items-center gap-2'
          >
            {statusInfo.icon}
            {statusInfo.text}
          </Badge>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* Connection Panel */}
          <Card className='shadow-md border-0'>
            <CardHeader className='bg-gray-50 dark:bg-gray-800 rounded-t-lg'>
              <CardTitle className='flex items-center gap-2'>
                <Link className='h-5 w-5 text-blue-500' />
                Connection
              </CardTitle>
              <CardDescription>{statusInfo.description}</CardDescription>
            </CardHeader>
            <CardContent className='pt-6'>
              <div className='mb-6'>
                <label className='block mb-2 text-sm font-medium'>
                  Your Peer ID
                </label>
                <div className='flex gap-2'>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Input
                          value={myPeerId}
                          readOnly
                          className='font-mono text-sm'
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Share this ID with others to connect</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    variant='outline'
                    onClick={copyPeerId}
                    className={copySuccess ? "bg-green-50 text-green-600" : ""}
                  >
                    {copySuccess ? (
                      <CheckCircle className='h-4 w-4' />
                    ) : (
                      <Copy className='h-4 w-4' />
                    )}
                  </Button>
                  <Button
                    variant='outline'
                    onClick={() => setShowQrDialog(true)}
                    className='text-blue-600'
                  >
                    <QrCode className='h-4 w-4' />
                  </Button>
                </div>
              </div>

              <div className='mb-6'>
                <label className='block mb-2 text-sm font-medium'>
                  Remote Peer ID
                </label>
                <Input
                  value={remotePeerId}
                  onChange={(e) => setRemotePeerId(e.target.value)}
                  disabled={connectionStatus === "connected"}
                  placeholder='Enter peer ID to connect'
                  className='font-mono text-sm'
                />
              </div>

              {error && (
                <Alert variant='destructive' className='mb-6'>
                  <AlertCircle className='h-4 w-4' />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className='flex justify-between bg-gray-50 dark:bg-gray-800 rounded-b-lg'>
              {connectionStatus !== "connected" ? (
                <Button
                  onClick={() => connectToPeer()}
                  disabled={!remotePeerId || connectionStatus === "connecting"}
                  className='w-full'
                >
                  {connectionStatus === "connecting" ? (
                    <RefreshCw className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <Link className='mr-2 h-4 w-4' />
                  )}
                  {connectionStatus === "connecting"
                    ? "Connecting..."
                    : "Connect"}
                </Button>
              ) : (
                <Button
                  variant='destructive'
                  onClick={disconnect}
                  className='w-full'
                >
                  <WifiOff className='mr-2 h-4 w-4' />
                  Disconnect
                </Button>
              )}
            </CardFooter>
          </Card>

          {/* File Transfer Panel */}
          <Card className='shadow-md border-0'>
            <CardHeader className='bg-gray-50 dark:bg-gray-800 rounded-t-lg'>
              <CardTitle className='flex items-center gap-2'>
                <Upload className='h-5 w-5 text-blue-500' />
                Send Files
              </CardTitle>
              <CardDescription>
                Share files securely with your connected peer
              </CardDescription>
            </CardHeader>
            <CardContent className='pt-6'>
              <div className='mb-6'>
                <input
                  type='file'
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className='hidden'
                />
                <Button
                  variant='outline'
                  className='w-full border-dashed border-2 h-24 flex flex-col gap-2'
                  onClick={() => fileInputRef.current.click()}
                  disabled={connectionStatus !== "connected"}
                >
                  <FileIcon className='h-6 w-6' />
                  <span>Choose a file to send</span>
                </Button>
              </div>

              {selectedFile && (
                <div className='mb-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800 relative'>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='absolute top-2 right-2 h-6 w-6 rounded-full'
                    onClick={clearSelectedFile}
                  >
                    <X className='h-4 w-4' />
                  </Button>
                  <div className='flex items-center gap-3'>
                    <div className='text-2xl'>
                      {getFileIcon(selectedFile.type)}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className='font-medium truncate'>
                        {selectedFile.name}
                      </p>
                      <p className='text-sm text-gray-500'>
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {(transferStatus === "sending" ||
                transferStatus === "receiving") && (
                <div className='mb-6'>
                  <div className='flex justify-between items-center mb-2'>
                    <span className='text-sm capitalize'>
                      {transferStatus === "sending" ? "Sending" : "Receiving"}
                      ...
                    </span>
                    <span className='text-sm font-medium'>
                      {transferProgress}%
                    </span>
                  </div>
                  <Progress
                    value={transferProgress}
                    className='h-2'
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
                  variant='success'
                  className='mb-6 bg-green-50 border-green-200 text-green-800'
                >
                  <CheckCircle className='h-4 w-4 text-green-500' />
                  <AlertTitle>Success</AlertTitle>
                  <AlertDescription>File sent successfully!</AlertDescription>
                </Alert>
              )}

              {transferStatus === "received" && (
                <Alert
                  variant='success'
                  className='mb-6 bg-green-50 border-green-200 text-green-800'
                >
                  <CheckCircle className='h-4 w-4 text-green-500' />
                  <AlertTitle>Success</AlertTitle>
                  <AlertDescription>
                    File received successfully!
                  </AlertDescription>
                </Alert>
              )}

              {transferStatus === "error" && (
                <Alert variant='destructive' className='mb-6'>
                  <AlertCircle className='h-4 w-4' />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    File transfer failed. Please try again.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className='bg-gray-50 dark:bg-gray-800 rounded-b-lg'>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className='w-full'>
                      <Button
                        onClick={sendFile}
                        disabled={
                          !selectedFile ||
                          connectionStatus !== "connected" ||
                          transferStatus === "sending"
                        }
                        className='w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                      >
                        <Upload className='mr-2 h-4 w-4' />
                        {transferStatus === "sending"
                          ? "Sending..."
                          : "Send File"}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {!selectedFile
                      ? "Select a file first"
                      : connectionStatus !== "connected"
                      ? "Connect to a peer first"
                      : ""}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardFooter>
          </Card>

          {/* Received Files */}
          <Card className='shadow-md border-0'>
            <CardHeader className='bg-gray-50 dark:bg-gray-800 rounded-t-lg'>
              <CardTitle className='flex items-center gap-2'>
                <Download className='h-5 w-5 text-blue-500' />
                Received Files
              </CardTitle>
              <CardDescription>
                Files you've received from peers
              </CardDescription>
            </CardHeader>
            <CardContent className='pt-6'>
              {receivedFiles.length === 0 ? (
                <div className='text-center py-8 text-gray-500'>
                  <FileIcon className='mx-auto h-12 w-12 text-gray-300 mb-2' />
                  <p>No files received yet</p>
                  <p className='text-sm mt-1'>
                    Files you receive will appear here
                  </p>
                </div>
              ) : (
                <div className='space-y-3 max-h-80 overflow-y-auto pr-2'>
                  {receivedFiles.map((file) => (
                    <div
                      key={file.id}
                      className='p-4 border rounded-lg flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 group'
                    >
                      <div className='text-2xl'>{getFileIcon(file.type)}</div>
                      <div className='flex-1 min-w-0'>
                        <p className='font-medium truncate'>{file.name}</p>
                        <p className='text-sm text-gray-500'>
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <div className='flex gap-2'>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8'
                          onClick={() => removeReceivedFile(file.id)}
                        >
                          <X className='h-4 w-4' />
                        </Button>
                        <a
                          href={file.url}
                          download={file.name}
                          className='inline-flex'
                        >
                          <Button size='sm' variant='outline'>
                            <Download className='h-4 w-4' />
                          </Button>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className='mt-10 text-center text-sm text-gray-500'>
          <p>
            Secure P2P file transfers directly between browsers. No data is
            stored on servers.
          </p>
        </div>

        {/* QR Code Dialog */}
        <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
          <DialogContent className='sm:max-w-md'>
            <DialogHeader>
              <DialogTitle>Share Your Connection</DialogTitle>
              <DialogDescription>
                Scan this QR code or share the link to connect quickly
              </DialogDescription>
            </DialogHeader>
            <div className='flex flex-col items-center justify-center py-4'>
              <div className='bg-white p-4 rounded-lg mb-4'>
                <QRCodeCanvas value={generateShareableLink()} size={200} />
              </div>
              <div className='flex w-full items-center space-x-2 mb-2'>
                <Input
                  value={generateShareableLink()}
                  readOnly
                  className='font-mono text-sm'
                />
                <Button
                  variant='outline'
                  className={
                    shareLinkCopied ? "bg-green-50 text-green-600" : ""
                  }
                  onClick={copyShareableLink}
                >
                  {shareLinkCopied ? (
                    <CheckCircle className='h-4 w-4' />
                  ) : (
                    <Copy className='h-4 w-4' />
                  )}
                </Button>
              </div>
              <p className='text-sm text-gray-500 text-center mt-2'>
                Anyone with this link or QR code can connect directly to your
                device
              </p>
            </div>
            <DialogClose asChild>
              <Button variant='outline' className='w-full'>
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
