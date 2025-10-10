// supabase/functions/auth-callback/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    // Check for tokens in both query parameters AND URL fragment
    let accessToken = url.searchParams.get("access_token");
    let refreshToken = url.searchParams.get("refresh_token");
    let error = url.searchParams.get("error");
    let errorDescription = url.searchParams.get("error_description");

    // If not found in query params, check the URL fragment
    if (!accessToken && url.hash) {
      const fragmentParams = new URLSearchParams(url.hash.substring(1));
      accessToken = fragmentParams.get("access_token");
      refreshToken = fragmentParams.get("refresh_token");
      error = fragmentParams.get("error");
      errorDescription = fragmentParams.get("error_description");
    }

    console.log("OAuth callback received:", {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      error,
      errorDescription,
      fullUrl: req.url,
      hash: url.hash,
      searchParams: Object.fromEntries(url.searchParams)
    });

    // Handle OAuth errors
    if (error) {
      console.error("OAuth error:", error, errorDescription);
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .error { color: #e74c3c; }
            </style>
          </head>
          <body>
            <h1 class="error">Authentication Failed</h1>
            <p>Error: ${error}</p>
            <p>Description: ${errorDescription || "Unknown error"}</p>
            <p>Please try again in VS Code.</p>
          </body>
        </html>
      `,
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "text/html" },
        }
      );
    }

    // Handle successful authentication
    if (accessToken) {
      console.log("OAuth callback received with access token, redirecting to VS Code");

      // Create the VS Code URI with tokens
      const vscodeUrl = `vscode://ai-collab-agent.auth?access_token=${encodeURIComponent(accessToken)}${
        refreshToken ? `&refresh_token=${encodeURIComponent(refreshToken)}` : ""
      }`;

      console.log("Redirecting to VS Code:", vscodeUrl);

      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              .success { color: #27ae60; }
              .loading { color: #3498db; }
              .code { background: #f4f4f4; padding: 10px; border-radius: 5px; font-family: monospace; }
            </style>
          </head>
          <body>
            <h1 class="success">Authentication Successful!</h1>
            <p class="loading">Redirecting to VS Code...</p>
            <p>If VS Code doesn't open automatically, <a href="${vscodeUrl}">click here</a></p>
            <div class="code">
              <p>VS Code URI: ${vscodeUrl}</p>
            </div>
            <script>
              console.log("Attempting to redirect to VS Code:", "${vscodeUrl}");
              
              // Try to redirect to VS Code
              try {
                window.location.href = "${vscodeUrl}";
                console.log("Redirect initiated");
              } catch (error) {
                console.error("Redirect failed:", error);
              }
              
              // Fallback: show manual link after 3 seconds
              setTimeout(() => {
                document.body.innerHTML = \`
                  <h1 class="success">Authentication Successful!</h1>
                  <p>Please <a href="${vscodeUrl}">click here</a> to return to VS Code.</p>
                  <div class="code">
                    <p>VS Code URI: ${vscodeUrl}</p>
                  </div>
                \`;
              }, 3000);
            </script>
          </body>
        </html>
      `,
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "text/html" },
        }
      );
    }

    // No tokens provided - this might be the initial request
    console.log("No access token found, showing instructions");
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Callback</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .info { color: #3498db; }
          </style>
        </head>
        <body>
          <h1 class="info">OAuth Callback Handler</h1>
          <p>This endpoint handles OAuth callbacks for the AI Collab Agent VS Code extension.</p>
          <p>If you're seeing this page, you may have accessed this URL directly.</p>
          <p>Please use the VS Code extension to authenticate.</p>
        </body>
      </html>
    `,
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      }
    );

  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Server Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #e74c3c; }
          </style>
        </head>
        <body>
          <h1 class="error">Server Error</h1>
          <p>Something went wrong. Please try again in VS Code.</p>
        </body>
      </html>
    `,
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      }
    );
  }
});