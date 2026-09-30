import { collection, deleteDoc, doc, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import { firebaseClient } from "./client";
import { toMillis } from "@/lib/format";

/** A connected AI assistant (MCP connector grant). Created by the server, readable by its owner. */
export type ConnectedApp = {
  id: string;
  clientName: string;
  clientHost: string;
  storeIds: string[];
  scopes: string[];
  createdAt: number;
  lastUsedAt: number;
};

export function listenConnectedApps(uid: string, cb: (apps: ConnectedApp[]) => void, onError?: (e: Error) => void): Unsubscribe {
  const { db } = firebaseClient();
  return onSnapshot(
    query(collection(db, "mcpGrants"), where("uid", "==", uid)),
    (snap) =>
      cb(
        snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              clientName: String(data.clientName ?? ""),
              clientHost: String(data.clientHost ?? ""),
              storeIds: Array.isArray(data.storeIds) ? data.storeIds : [],
              scopes: Array.isArray(data.scopes) ? data.scopes : [],
              createdAt: toMillis(data.createdAt),
              lastUsedAt: toMillis(data.lastUsedAt),
            };
          })
          .sort((a, b) => b.createdAt - a.createdAt),
      ),
    onError,
  );
}

export async function disconnectApp(id: string): Promise<void> {
  const { db } = firebaseClient();
  await deleteDoc(doc(db, "mcpGrants", id));
}
