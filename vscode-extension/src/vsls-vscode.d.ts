declare module "vsls/vscode" {
  import * as vscode from "vscode";

  export interface Session {
    id: string;
    peerNumber: number;
    role: string;
  }

  export interface LiveShare {
    getApiVersion(): string;
    getSessions(): Session[];
    onDidChangeSession: (callback: (e: any) => void) => void;

    // Add the missing properties
    share(): Promise<void>;
    session?: Session;
  }

  export function getApi(): Promise<LiveShare | null>;
}