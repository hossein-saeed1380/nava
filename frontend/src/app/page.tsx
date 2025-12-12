"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);

  const [textResponse, setTextResponse] = useState<any>([]);

  useEffect(() => {
    const socket = io("http://localhost:3000");

    setSocket(socket);

    socket.on("text", (message: any) => {
      setTextResponse((prev: any) => [...prev, JSON.parse(message)]);
    });

    return () => {
      setSocket(null);
      socket.disconnect();
    };
  }, []);

  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTextResponse([]);
    if (input.trim() !== "") {
      socket?.emit("text", input);
    }
  };

  const [isLoading, setIsLoading] = useState(false);
  const [isWebSearchLoading, setIsWebSearchLoading] = useState(false);

  return (
    <div className="flex items-center justify-center min-h-screen bg-stone-700">
      <div className="w-full max-w-md bg-stone-600 rounded shadow p-6 flex flex-col gap-6">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter your message"
            className="flex-1 px-3 py-2 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-stone-800 text-white"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Send
          </button>
        </form>
        {isLoading && <p>Loading...</p>}
        {isWebSearchLoading && <p>Web Search Loading...</p>}
        <div className="flex flex-col gap-2">
          {textResponse.map((responseObject: any) => {
            const idx = responseObject.sequence_number;
            if (responseObject?.type === "response.created") {
              return null;
            }
            if (responseObject?.type === "response.in_progress") {
              setIsLoading(true);
              return null;
            }
            if (responseObject?.type === "response.output_item.added") {
              return null;
            }
            if (
              responseObject?.type === "response.web_search_call.in_progress"
            ) {
              setIsWebSearchLoading(true);
              return null;
            }
            if (responseObject?.type === "response.web_search_call.searching") {
              setIsWebSearchLoading(true);
              return null;
            }
            if (responseObject?.type === "response.web_search_call.completed") {
              setIsWebSearchLoading(false);
              return null;
            }
            if (responseObject?.type === "response.output_item.done") {
              setIsLoading(false);
              return null;
            }
            if (responseObject?.type === "response.content_part.added") {
              return null;
            }
            if (responseObject?.type === "response.content_part.done") {
              return null;
            }
            if (responseObject?.type === "response.output_text.delta") {
              return <>{responseObject?.delta}</>;
            }
            if (responseObject?.type === "response.output_text.done") {
              return null;
            }
            if (responseObject?.type === "response.completed") {
              return null;
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}
