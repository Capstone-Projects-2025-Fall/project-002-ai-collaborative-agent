import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

Deno.serve(async (req) => {
  try {
    const { project, users } = await req.json();

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "You are an expert project manager and team optimization specialist. Analyze the provided project and team data to provide detailed task delegation and team optimization recommendations."
          },
          {
            role: "user",
            content: `Please analyze this project and team composition and provide detailed task delegation:

PROJECT INFORMATION:
${JSON.stringify(project, null, 2)}

TEAM MEMBERS:
${JSON.stringify(users, null, 2)}

Please provide:
1. TEAM ANALYSIS: Evaluate skill mix, gaps, and compatibility
2. PROJECT FEASIBILITY: Assess achievability and challenges
3. ROLE ASSIGNMENTS: Recommend specific roles for each member
4. OPTIMIZATION RECOMMENDATIONS: Suggest improvements
5. RISK ASSESSMENT: Identify risks and mitigation strategies
6. DELIVERABLES MAPPING: Break down requirements into deliverables

Provide detailed, actionable insights for project success.`
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ message: aiResponse }),
      { 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
        } 
      }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error.message 
      }),
      { 
        status: 500,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        } 
      }
    );
  }
});