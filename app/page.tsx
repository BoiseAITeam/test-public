'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Terminal, Cpu, Box, Activity } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Home() {
  const [logs, setLogs] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProject, setSelectedProject] = useState<any | null>(null)
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview')

  useEffect(() => {
    const loadData = async () => {
      const { data: l } = await supabase.from('agent_logs').select('*').order('created_at', { ascending: false }).limit(20)
      const { data: p } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
      setLogs(l || []); setProjects(p || [])
    }
    loadData()

    const channel = supabase.channel('realtime')
      .on('postgres_changes', { event: 'INSERT', table: 'agent_logs' }, (payload) => {
        setLogs(prev => [payload.new, ...prev].slice(0, 20))
      })
      .on('postgres_changes', { event: 'INSERT', table: 'projects' }, (payload) => {
        setProjects(prev => [payload.new, ...prev])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <main className="min-h-screen p-4 font-mono text-[12px] md:text-sm">
      <div className="max-w-6xl mx-auto border border-green-500/30 bg-black/50 p-6 shadow-[0_0_20px_rgba(0,255,65,0.1)]">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-green-500/30 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <Cpu className="text-green-500 animate-pulse" />
            <h1 className="text-lg font-bold uppercase tracking-[0.2em]">Agent_Project_Hub v1.0</h1>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-green-500/50">
            <div className="flex items-center gap-1"><Activity size={12}/> ENGINE: OLLAMA</div>
            <div className="bg-green-500/20 px-2 py-1 rounded text-green-400">STATUS: ACTIVE</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Terminal */}
          <div className="lg:col-span-2 border border-green-500/20 bg-black/80 flex flex-col h-[600px]">
            <div className="bg-green-500/10 px-4 py-2 border-b border-green-500/20 flex items-center gap-2">
              <Terminal size={14} /> <span>AGENT_PROCESS_LOGS</span>
            </div>
            <div className="p-4 overflow-y-auto flex flex-col-reverse gap-2 flex-1 scrollbar-hide">
              {logs.map((log) => (
                <div key={log.id} className="opacity-80 hover:opacity-100 transition-opacity">
                  <span className="text-green-900 mr-2">[{new Date(log.created_at).toLocaleTimeString()}]</span>
                  <span className="text-blue-400 mr-2 font-bold">{log.agent_name}:</span>
                  <span className="text-green-100">{log.message}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Artifacts */}
          <div className="border border-green-500/20 bg-black/80 flex flex-col h-[600px]">
            <div className="bg-green-500/10 px-4 py-2 border-b border-green-500/20 flex items-center gap-2">
              <Box size={14} /> <span>CREATED_PROJECTS</span>
            </div>
            <div className="p-4 overflow-y-auto space-y-4 flex-1 scrollbar-hide">
              {projects.map((p) => (
                <div key={p.id} className="border border-green-500/30 p-4 hover:bg-green-500/5 cursor-pointer transition-all">
                  <h3 className="text-white font-bold mb-1 uppercase tracking-tight">{p.title}</h3>
                  <p className="text-green-500/60 text-xs leading-relaxed">{p.description}</p>
                  <button
                    onClick={() => { setSelectedProject(p); setViewMode('preview') }}
                    className="mt-3 text-[10px] border border-green-500/50 inline-block px-2 py-1 hover:bg-green-500 hover:text-black transition-colors"
                  >
                    VIEW_CODE_OUTPUT
                  </button> 
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedProject && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-6">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSelectedProject(null)} />
          <div className="relative w-full max-w-4xl bg-[#0b0b0b] border border-green-500/30 rounded shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-green-500/20">
              <div>
                <h2 className="text-sm font-bold">{selectedProject.title}</h2>
                <div className="text-xs text-green-500/60">{new Date(selectedProject.created_at).toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setViewMode('preview')} className={`px-3 py-1 text-[11px] rounded ${viewMode === 'preview' ? 'bg-green-500 text-black' : 'bg-transparent border border-green-500/30 text-green-400'}`}>Preview</button>
                <button onClick={() => setViewMode('source')} className={`px-3 py-1 text-[11px] rounded ${viewMode === 'source' ? 'bg-green-500 text-black' : 'bg-transparent border border-green-500/30 text-green-400'}`}>Source</button>
                <button onClick={() => navigator.clipboard?.writeText(selectedProject.content || '')} className="px-3 py-1 text-[11px] border border-green-500/30 rounded text-green-400">Copy</button>
                <button onClick={() => setSelectedProject(null)} className="px-3 py-1 text-[11px] border border-red-600/30 rounded text-red-400">Close</button>
              </div>
            </div>
            <div className="p-4 max-h-[70vh] overflow-auto bg-black/90">
              {viewMode === 'preview' ? (
                <div className="max-w-full" dangerouslySetInnerHTML={{ __html: selectedProject.content || '<div className="text-xs text-green-400">No content</div>' }} />
              ) : (
                <pre className="whitespace-pre-wrap text-[12px] text-green-200 bg-black/90 p-3 rounded"><code>{selectedProject.content}</code></pre>
              )}
            </div>
          </div>
        </div>
      )}

    </main>
  )
}