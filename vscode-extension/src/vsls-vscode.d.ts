declare module "vsls/vscode" {
  import * as vscode from "vscode";

  export interface Session {
    id: string;
    peerNumber: number;
    role: string;
  }

  export interface Peer {
    user?: {
      emailAddress?: string;
      displayName?: string;
    };
  }

  export interface LiveShare {
    getApiVersion(): string;
    getSessions(): Session[];
    onDidChangeSession: (callback: (e: any) => void) => void;

    // Add the missing properties
    share(): Promise<Session | null>;
    join(uri: vscode.Uri): Promise<Session | null>;
    session?: Session;
    peers?: Peer[];
  }

  export function getApi(): Promise<LiveShare | null>;
}