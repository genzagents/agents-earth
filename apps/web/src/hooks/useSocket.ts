import { useEffect } from "react";
import { socket } from "../socket";
import { useWorldStore } from "../store/worldStore";

export function useSocket() {
  const { setWorld, setConnected } = useWorldStore();

  useEffect(() => {
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("client:ready");
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("world:tick", (state) => {
      setWorld(state);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("world:tick");
    };
  }, [setWorld, setConnected]);
}
