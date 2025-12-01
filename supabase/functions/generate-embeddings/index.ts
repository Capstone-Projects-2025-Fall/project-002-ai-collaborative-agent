import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiting: max embeddings per user per minute
const RATE_LIMIT_PER_MINUTE = 20
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const userLimit = rateLimitMap.get(userId)

  if (!userLimit || now > userLimit.resetAt) {
    rateLimitMap.set(userId, {
      count: 1,
      resetAt: now + 60000 // 1 minute
    })
    return true
  }

  if (userLimit.count >= RATE_LIMIT_PER_MINUTE) {
    return false
  }

  userLimit.count++
  return true
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get OpenAI API key from environment
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured in edge function')
    }

    // Parse request
    const { texts, projectId, userId } = await req.json()

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'texts array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check rate limit
    if (!checkRateLimit(userId)) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          message: `Maximum ${RATE_LIMIT_PER_MINUTE} embeddings per minute`
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // DEVELOPMENT MODE: Skip authorization checks
    // TODO: Re-enable authorization for production
    console.log('Generating embeddings for:', { userId, projectId, textCount: texts.length })

    // Call OpenAI API to generate embeddings
    const openaiResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        input: texts,
        model: 'text-embedding-ada-002'
      })
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('OpenAI API error:', errorText)
      throw new Error(`OpenAI API error: ${openaiResponse.statusText}`)
    }

    const openaiData = await openaiResponse.json()

    // Extract embeddings
    const embeddings = openaiData.data.map((item: any) => item.embedding)

    // Log usage for cost tracking
    const totalTokens = openaiData.usage?.total_tokens || 0
    console.log(`Generated ${embeddings.length} embeddings using ${totalTokens} tokens for user ${userId}`)

    // Return embeddings
    return new Response(
      JSON.stringify({
        embeddings,
        usage: {
          total_tokens: totalTokens,
          embedding_count: embeddings.length
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error: any) {
    console.error('Error in generate-embeddings function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

