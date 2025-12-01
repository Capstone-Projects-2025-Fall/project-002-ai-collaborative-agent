import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { query, projectId, useRAG = true } = await req.json()

    if (!query || !projectId) {
      return new Response(
        JSON.stringify({ error: 'Missing query or projectId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    let context = ''
    let relevantFiles: any[] = []

    // If RAG is enabled, retrieve relevant context from workspace
    if (useRAG) {
      // Generate embedding for the query (you'd call OpenAI/Claude API here)
      // For now, using a simplified approach
      const { data: workspaceFiles, error: searchError } = await supabase
        .from('project_workspace_files')
        .select('file_path, chunk_text, file_language')
        .eq('project_id', projectId)
        .limit(10)

      if (!searchError && workspaceFiles && workspaceFiles.length > 0) {
        relevantFiles = workspaceFiles
        context = `\n\n=== RELEVANT CODE FROM WORKSPACE ===\n\n`
        
        workspaceFiles.forEach((file: any, index: number) => {
          context += `File ${index + 1}: ${file.file_path} (${file.file_language})\n`
          context += `\`\`\`${file.file_language}\n${file.chunk_text}\n\`\`\`\n\n`
        })

        context += `=== END OF WORKSPACE CONTEXT ===\n\n`
      }
    }

    // Get project details
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('name, description, goals, requirements')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: 'Project not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get team members for this project
    const { data: members, error: membersError } = await supabase
      .from('project_members')
      .select(`
        profiles (
          name,
          skills,
          programming_languages,
          willing_to_work_on
        )
      `)
      .eq('project_id', projectId)

    const teamInfo = members?.map((m: any) => {
      const profile = m.profiles
      return `- ${profile.name}: Skills: ${profile.skills || 'N/A'}, Languages: ${profile.programming_languages || 'N/A'}`
    }).join('\n') || 'No team members found'

    // Construct the enhanced prompt with RAG context
    const enhancedPrompt = `You are an AI assistant helping with a collaborative coding project.

PROJECT INFORMATION:
Name: ${project.name}
Description: ${project.description}
Goals: ${project.goals}
Requirements: ${project.requirements}

TEAM MEMBERS:
${teamInfo}
${context}

USER QUERY:
${query}

Please provide a helpful, specific answer that:
1. Uses the actual code from the workspace when relevant
2. Considers the project goals and requirements
3. Takes into account the team's skills and expertise
4. Provides actionable recommendations
5. References specific files and code when applicable

If workspace context was provided, please reference specific files and code snippets in your answer.
`

    // Call Claude/OpenAI API for the actual AI response
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    
    if (!anthropicApiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'AI service not configured',
          message: 'Please set up ANTHROPIC_API_KEY in Supabase Edge Function secrets'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: enhancedPrompt
          }
        ]
      })
    })

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text()
      console.error('Claude API error:', errorText)
      return new Response(
        JSON.stringify({ 
          error: 'AI service error',
          details: errorText
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const aiData = await aiResponse.json()
    const aiMessage = aiData.content[0].text

    // Store the interaction in the database
    await supabase.from('ai_prompts').insert({
      project_id: projectId,
      prompt_content: query,
      ai_response: aiMessage,
    })

    return new Response(
      JSON.stringify({
        response: aiMessage,
        context_used: relevantFiles.length > 0,
        files_referenced: relevantFiles.length,
        project_name: project.name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error in RAG query function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

