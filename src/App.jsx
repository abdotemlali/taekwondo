import { useReducer, useEffect, useRef, useState } from 'react'
import { Peer } from 'peerjs'

// ─── INITIAL STATE ─────────────────────────────────────────────────────────────
const CONFIG_INITIALE = {
  nomRouge: 'ROUGE',
  nomBleu: 'BLEU',
  nbRounds: 3,
  dureeRound: 120, // seconds
  pointsTete: 3,
  pointsCorps: 2,
  pointsJambes: 1,
}

const etatInitial = (config = CONFIG_INITIALE) => ({
  config,
  roundActuel: 1,
  statut: 'en_attente', // en_attente | en_cours | pause | terminé
  tempsRestant: config.dureeRound,
  scores: {
    rouge: { tete: 0, corps: 0, jambes: 0 },
    bleu:  { tete: 0, corps: 0, jambes: 0 },
  },
  roundsGagnes: {
    rouge: 0,
    bleu: 0,
  }
})

// ─── REDUCER ──────────────────────────────────────────────────────────────────
function calculerTotal(scores, config) {
  return scores.tete * config.pointsTete +
         scores.corps * config.pointsCorps +
         scores.jambes * config.pointsJambes
}

function reducer(state, action) {
  switch (action.type) {
    case 'DEMARRER':
      return { ...state, statut: 'en_cours' }

    case 'PAUSE':
      return { ...state, statut: 'pause' }

    case 'REPRENDRE':
      return { ...state, statut: 'en_cours' }

    case 'TICK':
      if (state.statut !== 'en_cours') return state
      if (state.tempsRestant <= 1) {
        if (state.roundActuel >= state.config.nbRounds) {
          return { ...state, tempsRestant: 0, statut: 'pause' } // Arbitre will finalize
        }
        return {
          ...state,
          tempsRestant: 0,
          statut: 'pause',
        }
      }
      return { ...state, tempsRestant: state.tempsRestant - 1 }

    case 'FIN_ROUND': {
      const totalRouge = calculerTotal(state.scores.rouge, state.config)
      const totalBleu = calculerTotal(state.scores.bleu, state.config)
      
      const rGagnes = { ...(state.roundsGagnes || {rouge:0, bleu:0}) }
      if (totalRouge > totalBleu) rGagnes.rouge += 1
      if (totalBleu > totalRouge) rGagnes.bleu += 1

      const scVides = {
        rouge: { tete: 0, corps: 0, jambes: 0 },
        bleu:  { tete: 0, corps: 0, jambes: 0 },
      }

      const roundsRequis = Math.floor(state.config.nbRounds / 2) + 1
      const victoireAnticipee = rGagnes.rouge >= roundsRequis || rGagnes.bleu >= roundsRequis

      if (state.roundActuel >= state.config.nbRounds || victoireAnticipee) {
        return { ...state, statut: 'terminé', tempsRestant: 0, roundsGagnes: rGagnes, scores: scVides }
      }
      return {
        ...state,
        roundActuel: state.roundActuel + 1,
        tempsRestant: state.config.dureeRound,
        statut: 'en_attente',
        roundsGagnes: rGagnes,
        scores: scVides,
      }
    }

    case 'FIN_COMBAT': {
      const totalR = calculerTotal(state.scores.rouge, state.config)
      const totalB = calculerTotal(state.scores.bleu, state.config)
      
      const rGagnesF = { ...(state.roundsGagnes || {rouge:0, bleu:0}) }
      if (totalR > totalB) rGagnesF.rouge += 1
      if (totalB > totalR) rGagnesF.bleu += 1
      
      const scVidesF = {
        rouge: { tete: 0, corps: 0, jambes: 0 },
        bleu:  { tete: 0, corps: 0, jambes: 0 },
      }
      
      return { ...state, statut: 'terminé', tempsRestant: 0, roundsGagnes: rGagnesF, scores: scVidesF }
    }

    case 'AJUSTER_SCORE': {
      const { combattant, zone, delta } = action
      const ancienScore = state.scores[combattant][zone]
      const nouveauScore = Math.max(0, ancienScore + delta)
      return {
        ...state,
        scores: {
          ...state.scores,
          [combattant]: {
            ...state.scores[combattant],
            [zone]: nouveauScore,
          },
        },
      }
    }

    case 'MAJ_NOM': {
      const { combattant, nom } = action
      const nomConfigKey = combattant === 'rouge' ? 'nomRouge' : 'nomBleu'
      return {
        ...state,
        config: {
          ...state.config,
          [nomConfigKey]: nom
        }
      }
    }

    case 'APPLIQUER_CONFIG': {
      return {
        ...etatInitial(action.config),
      }
    }

    case 'REINITIALISER':
      return etatInitial(state.config)
      
    case 'SYNC_STATE':
      return { ...action.state }

    default:
      return state
  }
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function formaterTemps(secondes) {
  const m = Math.floor(secondes / 60).toString().padStart(2, '0')
  const s = (secondes % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function etiquetteStatut(statut) {
  switch (statut) {
    case 'en_attente': return 'EN ATTENTE'
    case 'en_cours':   return 'EN COURS'
    case 'pause':      return 'PAUSE'
    case 'terminé':    return 'TERMINÉ'
    default:           return statut.toUpperCase()
  }
}

// ─── PUBLIC VIEW ──────────────────────────────────────────────────────────────
function VuePublique({ state }) {
  const { config, scores, roundActuel, statut, tempsRestant } = state
  const totalRouge = calculerTotal(scores.rouge, config)
  const totalBleu  = calculerTotal(scores.bleu, config)

  const estTermine = statut === 'terminé'
  const timerDanger = tempsRestant < 30 && statut === 'en_cours'

  let vainqueur = null
  if (estTermine) {
    const rgR = state.roundsGagnes?.rouge || 0
    const rgB = state.roundsGagnes?.bleu || 0
    if (rgR > rgB) vainqueur = 'rouge'
    else if (rgB > rgR) vainqueur = 'bleu'
    else vainqueur = 'egalite'
  }

  return (
    <div className="h-full bg-black flex flex-col font-ui text-white overflow-hidden relative">
      
      {/* HEADER BAR (Like image) */}
      <div className="h-[10%] min-h-[60px] bg-black border-b-[6px] border-[#333] flex items-center justify-between px-4 lg:px-8 z-20">
         <div className="flex items-center gap-4 text-xl">
           <span className="text-3xl">🥋</span>
           <span className="font-bold tracking-widest text-[#fff] text-xs md:text-sm lg:text-base leading-tight">WORLD<br/>TAEKWONDO</span>
         </div>
         
         <div className="text-lg md:text-2xl lg:text-4xl font-bold tracking-wider text-white/90 truncate mx-4">
           MATCH OFFICIEL
         </div>
         
         <div className="flex items-center gap-4">
           {statut === 'en_cours' && <span className="pulse-dot w-3 h-3 rounded-full bg-red-500 block"></span>}
           <span className="bg-slate-800 px-4 py-1.5 rounded-full border border-slate-600 shadow-inner title-font text-white/80">
             {config.nbRounds} R
           </span>
         </div>
      </div>

      {/* FULL BLEED CONTENT GRID */}
      <main className="flex-1 w-full flex flex-row items-stretch z-10 relative">
        
        {/* BLUE SIDE (LEFT) */}
        <div className="flex-1 w-1/3">
          <ScoreCardPublique 
            combattant="bleu"
            nom={config.nomBleu}
            scores={scores.bleu}
            total={totalBleu}
            roundsGagnes={state.roundsGagnes?.bleu || 0}
            isWinner={vainqueur === 'bleu'}
          />
        </div>

        {/* CENTER COLUMN (TIMER & ROUND) */}
        <div className="w-[25%] lg:w-[25%] flex flex-col border-x-4 lg:border-x-8 border-black shadow-[0_0_50px_rgba(0,0,0,0.5)] z-20">
          {/* TIMER (TOP HALF YELLOW) */}
          <div className="flex-1 bg-[#ffea00] flex flex-col items-center justify-center p-2 relative">
             <div className="absolute top-2 md:top-6 lg:top-8 text-black font-bold text-lg md:text-3xl lg:text-4xl capitalize tracking-tight">
               {statut === 'pause' ? 'Time out' : statut === 'en_cours' ? 'Fight' : vainqueur ? 'Terminé' : 'Match'}
             </div>
             <div className={`text-black title-font text-6xl md:text-[7rem] lg:text-[11rem] leading-[0.8] tracking-tighter mt-4 md:mt-8 tabular-nums ${timerDanger ? 'animate-pulse text-red-600' : ''}`}>
               {formaterTemps(tempsRestant)}
             </div>
          </div>
          
          {/* ROUND (BOTTOM HALF BLACK) */}
          <div className="flex-1 bg-black flex flex-col items-center justify-center p-2 relative">
             <div className="absolute top-2 md:top-6 lg:top-8 text-white font-bold text-lg md:text-3xl lg:text-4xl uppercase tracking-widest">
               ROUND
             </div>
             <div className="text-white title-font text-6xl md:text-[7rem] lg:text-[10rem] leading-[0.8] mt-4 md:mt-8">
               {roundActuel}
             </div>
             {/* Small accent dot from the image */}
             <div className="absolute left-4 bottom-4 md:left-8 md:bottom-8 w-4 h-4 md:w-6 md:h-6 rounded-full border-[3px] border-[#1E90FF] shadow-[0_0_15px_#1E90FF]" />
          </div>
        </div>

        {/* RED SIDE (RIGHT) */}
        <div className="flex-1 w-1/3">
          <ScoreCardPublique 
            combattant="rouge"
            nom={config.nomRouge}
            scores={scores.rouge}
            total={totalRouge}
            roundsGagnes={state.roundsGagnes?.rouge || 0}
            isWinner={vainqueur === 'rouge'}
          />
        </div>

      </main>

      {/* OVERLAY FIN DE COMBAT */}
      {estTermine && vainqueur && (
        <div className="absolute inset-0 z-50 flex items-center justify-center animate-winner-bg p-8">
          {vainqueur === 'egalite' ? (
             <div className="title-font text-[10rem] text-purple-500 animate-pulse drop-shadow-[0_0_50px_rgba(168,85,247,0.5)]">ÉGALITÉ</div>
          ) : (
            <div className={`relative flex flex-col items-center justify-center w-full max-w-5xl aspect-video md:aspect-[21/9] rounded-[4rem] shadow-[0_0_150px_rgba(0,0,0,0.8)] border-[8px] md:border-[16px] animate-winner-card overflow-hidden ${
              vainqueur === 'rouge' ? 'bg-[#ca1917] border-[#ff4d4d]' : 'bg-[#15349e] border-[#4d88ff]'
            }`}>
               <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.2)_0%,transparent_70%)] rounded-[4rem]" />
               
               <div className="text-white/80 font-bold tracking-[0.4em] md:tracking-[0.8em] text-xl md:text-3xl uppercase mb-2 md:mb-6 z-10 animate-pulse">
                 Winner
               </div>
               
               <div className="title-font text-[6rem] md:text-[12rem] lg:text-[16rem] leading-none text-white drop-shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-10 text-center px-4 w-full truncate">
                 {vainqueur === 'rouge' ? config.nomRouge : config.nomBleu}
               </div>

               <div className="flex gap-4 md:gap-8 mt-4 md:mt-8 z-10 text-5xl md:text-8xl">
                  <span className="animate-[bounce_2s_infinite]" style={{ animationDelay: '0s' }}>🥇</span>
               </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ScoreCardPublique({ combattant, nom, scores, total, roundsGagnes, isWinner }) {
  const isRed = combattant === 'rouge'
  const bgColor = isRed ? 'bg-[#ca1917]' : 'bg-[#15349e]'
  const bannerColor = isRed ? 'bg-[#980806]' : 'bg-[#0f216b]'
  const abbr = isRed ? 'ROU' : 'BLE'
  
  return (
    <div className={`h-full w-full flex flex-col relative ${bgColor} ${isWinner ? 'winner-glow' : ''}`}>
      {/* BANNER (TOP) */}
      <div className={`h-[15%] min-h-[60px] w-full ${bannerColor} flex items-center justify-center px-4 shadow-xl z-20`}>
         <div className="title-font text-3xl md:text-5xl lg:text-7xl text-white truncate drop-shadow-md">
           {nom}
         </div>
      </div>

      {/* ABBREVIATION & ROUNDS WON */}
      <div className={`absolute top-[18%] flex items-center gap-4 ${isRed ? 'right-4 lg:right-6 flex-row-reverse' : 'left-4 lg:left-6 flex-row'} z-10 hidden md:flex`}>
         <div className="title-font text-4xl md:text-6xl lg:text-7xl text-white/90 drop-shadow-md tracking-wide">
           {abbr}
         </div>
         {/* Rounds won display (e.g. 2R) with Bright yellow context */}
         <div className="bg-black/40 backdrop-blur-sm title-font text-[#ffea00] font-bold text-3xl lg:text-5xl pb-1 px-4 rounded-xl border border-white/10 shadow-lg">
           {roundsGagnes} <span className="text-white/60 text-base lg:text-xl">R</span>
         </div>
      </div>

      {/* SCORE (CENTER) */}
      <div className="flex-1 flex items-center justify-center relative -mt-[10%] lg:-mt-[5%]">
         <div 
           className="title-font font-bold leading-none text-white tabular-nums z-10"
           style={{ 
             fontSize: 'clamp(10rem, 30vw, 35rem)', 
             textShadow: '8px 12px 0px rgba(0,0,0,0.2)' 
           }}
         >
           {total}
         </div>
      </div>

      {/* VIDEO ICON */}
      <div className="absolute bottom-[20%] w-full flex justify-center opacity-70">
         <svg width="48" height="48" className="md:w-[64px] md:h-[64px]" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
           <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
         </svg>
      </div>

      {/* GAM-JEOM EQUIVALENT (Touches bottom corners) */}
      <div className={`absolute bottom-4 flex flex-col items-center ${isRed ? 'right-4 lg:right-8' : 'left-4 lg:left-8'}`}>
         <div className="text-white/80 font-bold text-[10px] md:text-sm tracking-[0.2em] mb-0 md:mb-1 uppercase">Touches</div>
         <div className="text-white font-bold text-3xl md:text-5xl">{scores.tete + scores.corps + scores.jambes}</div>
      </div>
      
      {/* DETAIL POINTS (Inside bottom) */}
      <div className={`absolute bottom-4 flex gap-3 md:gap-6 opacity-60 ${isRed ? 'left-4 lg:left-8' : 'right-4 lg:right-8'}`}>
        <div className="flex flex-col items-center">
          <span className="text-[9px] md:text-xs font-bold uppercase tracking-widest text-[#ffea00]">Tête</span>
          <span className="text-lg md:text-2xl font-bold">{scores.tete}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] md:text-xs font-bold uppercase tracking-widest text-[#ffea00]">Corps</span>
          <span className="text-lg md:text-2xl font-bold">{scores.corps}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[9px] md:text-xs font-bold uppercase tracking-widest text-[#ffea00]">Jam.</span>
          <span className="text-lg md:text-2xl font-bold">{scores.jambes}</span>
        </div>
      </div>
    </div>
  )
}

// ─── REFEREE VIEW ─────────────────────────────────────────────────────────────
function VueArbitre({ state, dispatch }) {
  const { config, scores, roundActuel, statut, tempsRestant } = state
  const [showConfig, setShowConfig] = useState(false)
  const [configLocale, setConfigLocale] = useState(config)

  const totalRouge = calculerTotal(scores.rouge, config)
  const totalBleu  = calculerTotal(scores.bleu, config)

  const peutDemarrer   = statut === 'en_attente'
  const peutPauser     = statut === 'en_cours'
  const peutReprendre  = statut === 'pause' && tempsRestant > 0
  const estTermine     = statut === 'terminé'

  const timerDanger = tempsRestant < 30 && statut === 'en_cours'

  const handleConfig = (champ, valeur) => {
    setConfigLocale(prev => ({ ...prev, [champ]: valeur }))
  }

  const appliquerConfig = (e) => {
    e.preventDefault()
    dispatch({
      type: 'APPLIQUER_CONFIG',
      config: {
        ...configLocale,
        nbRounds: parseInt(configLocale.nbRounds) || 3,
        dureeRound: parseInt(configLocale.dureeRound) || 120,
        pointsTete: parseInt(configLocale.pointsTete) || 3,
        pointsCorps: parseInt(configLocale.pointsCorps) || 2,
        pointsJambes: parseInt(configLocale.pointsJambes) || 1,
      }
    })
    setShowConfig(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 font-ui text-slate-900 pb-20">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex flex-col md:flex-row items-center justify-between shadow-sm sticky top-[52px] z-40 gap-4 md:gap-0">
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto text-center md:text-left">
          <div className="p-2 bg-slate-100 rounded-lg text-xl md:text-2xl hidden md:block">📱</div>
          <div>
            <div className="title-font text-xl md:text-2xl tracking-wide text-slate-800 leading-none">PANNEAU ARBITRE</div>
            <div className="text-[10px] md:text-xs font-semibold text-slate-500 uppercase tracking-widest mt-1">Contrôle du Combat</div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 md:gap-6 w-full md:w-auto">
          <div className={`px-4 md:px-6 py-2 rounded-2xl flex flex-col items-center justify-center transition-colors ${timerDanger ? 'bg-red-50 border border-red-200' : 'bg-slate-100'}`}>
             <div className="text-[9px] md:text-[10px] font-bold text-slate-500 tracking-widest uppercase">Round {roundActuel}/{config.nbRounds}</div>
             <div className={`title-font text-3xl md:text-4xl leading-none mt-1 ${timerDanger ? 'text-red-600 animate-pulse' : 'text-slate-800'}`}>
               {formaterTemps(tempsRestant)}
             </div>
          </div>

          <div className={`px-3 md:px-4 py-1.5 md:py-2 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${
            statut === 'en_cours' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
            statut === 'pause' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
            statut === 'terminé' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
            'bg-slate-100 text-slate-600 border border-slate-200'
          }`}>
             {statut === 'en_cours' && <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
             {etiquetteStatut(statut)}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => { setConfigLocale(config); setShowConfig(true) }} className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          </button>
          <button onClick={() => { if(window.confirm('Réinitialiser le combat ?')) dispatch({ type: 'REINITIALISER' })}} className="p-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl font-medium transition-colors">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          </button>
        </div>
      </header>

      {/* CONFIG MODAL */}
      {showConfig && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={appliquerConfig} className="bg-white rounded-3xl shadow-2xl p-8 max-w-3xl w-full">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <h2 className="title-font text-3xl text-slate-800 tracking-wide">Configuration du Match</h2>
              <button type="button" onClick={() => setShowConfig(false)} className="text-slate-400 hover:text-slate-600">
                <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="space-y-4 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <h3 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-2">Général</h3>
                <InputGroup label="Nom Combattant Rouge" type="text" value={configLocale.nomRouge} onChange={v => handleConfig('nomRouge', v)} activeColor="border-red-400" />
                <InputGroup label="Nom Combattant Bleu" type="text" value={configLocale.nomBleu} onChange={v => handleConfig('nomBleu', v)} activeColor="border-blue-400" />
                <div className="grid grid-cols-2 gap-4">
                  <InputGroup label="Nombre de Rounds" type="number" min={1} max={5} value={configLocale.nbRounds} onChange={v => handleConfig('nbRounds', v)} />
                  <InputGroup label="Durée (sec)" type="number" min={30} max={300} value={configLocale.dureeRound} onChange={v => handleConfig('dureeRound', v)} />
                </div>
              </div>
              
              <div className="space-y-4 p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <h3 className="text-xs font-bold tracking-widest text-slate-400 uppercase mb-2">Points par Frappe</h3>
                <InputGroup label="Tête" type="number" min={1} max={10} value={configLocale.pointsTete} onChange={v => handleConfig('pointsTete', v)} />
                <InputGroup label="Corps" type="number" min={1} max={10} value={configLocale.pointsCorps} onChange={v => handleConfig('pointsCorps', v)} />
                <InputGroup label="Jambes" type="number" min={1} max={10} value={configLocale.pointsJambes} onChange={v => handleConfig('pointsJambes', v)} />
              </div>
            </div>

            <div className="flex gap-4 justify-end">
              <button type="button" onClick={() => setShowConfig(false)} className="px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Annuler</button>
              <button type="submit" className="px-6 py-3 rounded-xl font-bold text-white bg-slate-800 hover:bg-slate-900 transition-colors shadow-lg">Sauvegarder et Réinitialiser</button>
            </div>
          </form>
        </div>
      )}

      {/* MAIN ARBITER GRID */}
      <main className="max-w-7xl mx-auto p-6 mt-4">
        
        {/* CONTROLS AREA */}
        <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200 mb-8 flex justify-center gap-4 flex-wrap">
          {peutDemarrer && <BoutonControle arbitre action={() => dispatch({ type: 'DEMARRER' })} label="Démarrer le Timer" icon="▶" color="emerald" />}
          {peutPauser && <BoutonControle arbitre action={() => dispatch({ type: 'PAUSE' })} label="Mettre en Pause" icon="⏸" color="amber" />}
          {peutReprendre && <BoutonControle arbitre action={() => dispatch({ type: 'REPRENDRE' })} label="Reprendre le Timer" icon="▶" color="emerald" />}
          
          {(statut === 'pause' || statut === 'en_cours') && tempsRestant === 0 && roundActuel < config.nbRounds && (
            <BoutonControle arbitre action={() => dispatch({ type: 'FIN_ROUND' })} label="Passer au Round Suivant" icon="⏭" color="emerald" />
          )}

          {(statut === 'pause' || statut === 'en_cours') && tempsRestant > 0 && roundActuel < config.nbRounds && (
            <BoutonControle arbitre action={() => { if(window.confirm('Terminer ce round en avance ?')) dispatch({ type: 'FIN_ROUND' }) }} label="Terminer le Round" icon="⏭" color="slate" />
          )}
          
          {(statut === 'en_cours' || statut === 'pause') && (
            <BoutonControle arbitre action={() => { if(window.confirm('Mettre fin au combat ?')) dispatch({ type: 'FIN_COMBAT' }) }} label="Forcer Fin de Match" icon="🛑" color="red" />
          )}
          
          {estTermine && (
            <div className="flex items-center gap-4">
              <div className="font-bold text-lg px-6 py-3 bg-slate-100 rounded-xl border border-slate-200">
                 {(() => {
                   const rgR = state.roundsGagnes?.rouge || 0;
                   const rgB = state.roundsGagnes?.bleu || 0;
                   return `COMBAT TERMINÉ : ${rgR > rgB ? `Victoire Rouge (${config.nomRouge})` : rgB > rgR ? `Victoire Bleu (${config.nomBleu})` : 'Égalité'}`;
                 })()}
              </div>
              <BoutonControle arbitre action={() => dispatch({ type: 'REINITIALISER' })} label="Lancer un autre combat" icon="🔄" color="emerald" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <PanneauArbitreCombattant 
            combattant="rouge"
            nom={config.nomRouge}
            scores={scores.rouge}
            total={totalRouge}
            roundsGagnes={state.roundsGagnes?.rouge || 0}
            config={config}
            dispatch={dispatch}
            estActif={!estTermine}
            peutEditer={statut === 'en_attente' && roundActuel === 1}
          />
          <PanneauArbitreCombattant 
            combattant="bleu"
            nom={config.nomBleu}
            scores={scores.bleu}
            total={totalBleu}
            roundsGagnes={state.roundsGagnes?.bleu || 0}
            config={config}
            dispatch={dispatch}
            estActif={!estTermine}
            peutEditer={statut === 'en_attente' && roundActuel === 1}
          />
        </div>
      </main>
    </div>
  )
}

function InputGroup({ label, type, value, onChange, min, max, activeColor = "border-slate-800" }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} min={min} max={max}
        className={`w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 bg-white text-slate-800 font-medium outline-none transition-colors focus:border-slate-400`} />
    </div>
  )
}

function BoutonControle({ action, label, icon, color }) {
  const colorMap = {
    emerald: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30',
    amber: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/30',
    red: 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30',
    slate: 'bg-slate-700 hover:bg-slate-800 text-white shadow-slate-500/30'
  }
  return (
    <button onClick={action} className={`flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg transition-transform hover:-translate-y-1 active:translate-y-0 shadow-lg ${colorMap[color]}`}>
      <span>{icon}</span> <span>{label}</span>
    </button>
  )
}

function PanneauArbitreCombattant({ combattant, nom, scores, total, roundsGagnes, config, dispatch, estActif, peutEditer }) {
  const isRed = combattant === 'rouge'
  const zones = [
    { key: 'tete', label: 'Tête', emoji: '🥋', pts: config.pointsTete },
    { key: 'corps', label: 'Corps', emoji: '👊', pts: config.pointsCorps },
    { key: 'jambes', label: 'Jambes', emoji: '🦵', pts: config.pointsJambes }
  ]

  return (
    <div className={`rounded-[2rem] p-4 lg:p-8 border-4 bg-white shadow-xl ${isRed ? 'border-red-100' : 'border-blue-100'}`}>
      <div className="flex flex-col sm:flex-row justify-between items-center sm:items-start mb-6 lg:mb-8 pb-4 lg:pb-6 border-b border-slate-100 gap-4 sm:gap-0 text-center sm:text-left">
        <div className="w-full sm:w-auto flex flex-col items-center sm:items-start">
          <div className={`text-xs lg:text-sm font-bold uppercase tracking-widest mb-1 lg:mb-2 ${isRed ? 'text-red-500' : 'text-blue-500'}`}>COIN {isRed?'ROUGE':'BLEU'}</div>
          {peutEditer ? (
            <input 
               type="text" 
               value={nom} 
               onChange={(e) => dispatch({ type: 'MAJ_NOM', combattant, nom: e.target.value })} 
               className={`title-font text-3xl lg:text-4xl text-slate-800 leading-none bg-slate-50 border-2 rounded-xl px-4 py-2 w-full sm:w-[220px] outline-none transition-colors ${isRed ? 'focus:border-red-400 border-red-200' : 'focus:border-blue-400 border-blue-200'}`}
               placeholder="Nom Combattant"
            />
          ) : (
            <div className="title-font text-4xl lg:text-5xl text-slate-800 leading-none truncate max-w-[220px]">{nom}</div>
          )}
        </div>
        <div className="flex gap-6 items-center">
          <div className="text-center sm:text-right border-r border-slate-200 pr-6">
            <div className="text-[10px] lg:text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">ROUNDS GAGNÉS</div>
            <div className={`score-font text-4xl lg:text-5xl font-bold leading-none text-slate-700`}>{roundsGagnes}</div>
          </div>
          <div className="text-center sm:text-right">
            <div className="text-[10px] lg:text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">SCORE ROUND</div>
            <div className={`score-font text-5xl lg:text-6xl font-bold leading-none ${isRed ? 'text-red-600':'text-blue-600'}`}>{total}</div>
          </div>
        </div>
      </div>

      <div className="space-y-4 lg:space-y-6">
        {zones.map(z => (
          <div key={z.key} className={`flex items-center justify-between lg:justify-start gap-2 lg:gap-4 p-3 lg:p-4 rounded-2xl lg:rounded-3xl border-2 transition-colors ${isRed ? 'bg-red-50/50 border-red-100 hover:border-red-200':'bg-blue-50/50 border-blue-100 hover:border-blue-200'}`}>
            <button 
              onClick={() => dispatch({ type: 'AJUSTER_SCORE', combattant, zone: z.key, delta: -1 })}
              disabled={!estActif || scores[z.key] === 0}
              className={`w-12 h-12 lg:w-16 lg:h-16 shrink-0 rounded-xl lg:rounded-2xl flex items-center justify-center font-bold text-2xl lg:text-3xl transition-transform active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow-sm ${isRed ? 'bg-white text-red-500 border-2 border-red-200 hover:bg-red-100' : 'bg-white text-blue-500 border-2 border-blue-200 hover:bg-blue-100'}`}
            >
              −
            </button>
            
            <div className="flex-1 flex flex-col items-center justify-center min-w-[80px]">
              <div className="text-[10px] lg:text-sm font-bold text-slate-500 uppercase tracking-widest text-center leading-tight">{z.label} {z.emoji}</div>
              <div className="text-[10px] lg:text-xs font-semibold text-slate-400 mt-1 hidden sm:block">{z.pts} pt{z.pts > 1 ? 's' : ''}/frappe</div>
              <div className="score-font text-2xl lg:text-4xl font-bold mt-1 lg:mt-2 text-slate-800">{scores[z.key]} <span className="text-xs lg:text-lg text-slate-400">touches</span></div>
            </div>

            <button 
              onClick={() => dispatch({ type: 'AJUSTER_SCORE', combattant, zone: z.key, delta: 1 })}
              disabled={!estActif}
              className={`w-16 h-16 lg:w-20 lg:h-20 shrink-0 rounded-xl lg:rounded-[1.5rem] flex items-center justify-center font-bold text-3xl lg:text-4xl transition-transform active:scale-90 disabled:opacity-30 disabled:pointer-events-none shadow-md ${isRed ? 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700' : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700'}`}
            >
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

const initMemoire = () => {
  try {
    const mem = localStorage.getItem('tkd_state');
    if (mem) return JSON.parse(mem);
  } catch (e) {
    console.error(e);
  }
  return etatInitial(CONFIG_INITIALE);
}

// ─── MAIN APP COMPONENT ────────────────────────────────────────────────────────
export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initMemoire)
  
  useEffect(() => {
    localStorage.setItem('tkd_state', JSON.stringify(state));
  }, [state]);
  const [vue, setVue] = useState('arbitre') // 'public' | 'arbitre'
  const [estAdmin, setEstAdmin] = useState(false)
  const [mdp, setMdp] = useState('')
  const [erreurMdp, setErreurMdp] = useState(false)
  
  const [pinCode, setPinCode] = useState(null)
  const [inputPin, setInputPin] = useState(localStorage.getItem('tkd_public_pin') || '')
  const [peerStatus, setPeerStatus] = useState('Déconnecté')
  const [isLinked, setIsLinked] = useState(false)
  const connectionsRef = useRef([])

  const intervalRef = useRef(null)
  
  const isReferee = vue === 'arbitre' && estAdmin;
  const stateRef = useRef(state);
  
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const reconnectTimerRef = useRef(null);
  const previouslyLinkedRef = useRef(false);

  // Arbitre : Création du Host PeerJS
  useEffect(() => {
    if (isReferee) {
      let savedPin = localStorage.getItem('tkd_admin_pin');
      if (!savedPin) {
        savedPin = Math.floor(1000 + Math.random() * 9000).toString();
        localStorage.setItem('tkd_admin_pin', savedPin);
      }
      setPinCode(savedPin);
      
      const peerConfig = {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ]
        }
      };

      const peer = new Peer(`tkd-arbitre-${savedPin}`, peerConfig);
      
      peer.on('open', () => setPeerStatus(`En attente (PIN: ${savedPin})`));
      
      peer.on('connection', (conn) => {
        connectionsRef.current.push(conn);
        setPeerStatus(`${connectionsRef.current.length} écran(s) connecté(s)`);
        
        conn.on('open', () => {
          conn.send({ type: 'SYNC_STATE', state: stateRef.current });
        });
        
        conn.on('close', () => {
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
          setPeerStatus(`${connectionsRef.current.length} écran(s) connecté(s)`);
        });

        conn.on('error', (err) => {
          console.error("Connection error:", err);
        });
      });

      peer.on('error', (err) => {
        console.error("Peer referee error:", err);
        setPeerStatus('Erreur de réseau. Veuillez rafraîchir.');
      });
      
      return () => {
        peer.destroy();
        setPinCode(null);
        connectionsRef.current = [];
      };
    }
  }, [isReferee]);

  const currentPeerRef = useRef(null);

  // Public : Connexion à l'arbitre
  const connectToReferee = (e) => {
    if (e) e.preventDefault();
    if (!inputPin) return;
    
    localStorage.setItem('tkd_public_pin', inputPin);
    
    if (currentPeerRef.current) {
      currentPeerRef.current.destroy();
    }
    
    setPeerStatus('Connexion au serveur...');
    
    const peerConfig = {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    };
    const peer = new Peer(peerConfig);
    currentPeerRef.current = peer;
    
    const tryReconnect = () => {
      setPeerStatus('Reconnexion automatique...');
      setIsLinked(previouslyLinkedRef.current); // Keep true if it dropped, false if it never worked
      clearTimeout(reconnectTimerRef.current);
      peer.destroy();
      reconnectTimerRef.current = setTimeout(() => {
        connectToReferee();
      }, 3000);
    };

    peer.on('open', () => {
      setPeerStatus('Recherche Console...');
      const conn = peer.connect(`tkd-arbitre-${inputPin}`, { reliable: true });
      
      conn.on('open', () => {
        setPeerStatus('Connecté');
        setIsLinked(true);
        previouslyLinkedRef.current = true;
        clearTimeout(reconnectTimerRef.current);
      });
      
      conn.on('data', (data) => {
        if (data.type === 'SYNC_STATE') {
          dispatch({ type: 'SYNC_STATE', state: data.state });
        }
      });
      
      conn.on('close', tryReconnect);
      conn.on('error', tryReconnect);
    });

    peer.on('error', (err) => {
      console.error(err);
      if (err.type === 'peer-unavailable') {
        if (previouslyLinkedRef.current) {
           tryReconnect();
        } else {
           setPeerStatus('Code PIN introuvable !');
           setIsLinked(false);
           peer.destroy();
        }
      } else {
        setPeerStatus(`Erreur: ${err.type}`);
        if (!previouslyLinkedRef.current) {
          setIsLinked(false);
          peer.destroy();
        }
      }
    });
  };

  // Arbitre envoie l'état à chaque modification locale
  useEffect(() => {
    if (isReferee && connectionsRef.current.length > 0) {
      connectionsRef.current.forEach(conn => {
        conn.send({ type: 'SYNC_STATE', state });
      });
    }
  }, [state, isReferee]);

  useEffect(() => {
    if (state.statut === 'en_cours') {
      intervalRef.current = setInterval(() => {
        dispatch({ type: 'TICK' })
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [state.statut])

  useEffect(() => {
    if (localStorage.getItem('tkd_auth') === 'admin') setEstAdmin(true);
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (mdp === '2026') {
      setEstAdmin(true);
      setErreurMdp(false);
      setMdp('');
      localStorage.setItem('tkd_auth', 'admin');
    } else {
      setErreurMdp(true);
      setMdp('');
    }
  };

  return (
    <div className="selection:bg-slate-800 selection:text-white">
      {/* GLOBAL NAVBAR */}
      <div className="fixed top-0 inset-x-0 h-[52px] bg-slate-900 z-50 flex items-center justify-between px-6 border-b border-black">
        <div className="flex items-center gap-2 text-slate-300 font-semibold tracking-widest text-xs uppercase">
          <span className="text-base">🥋</span> Taekwondo Pro Score
          <span className="ml-4 px-2 py-1 rounded bg-slate-800 text-slate-400">
            {isReferee && pinCode ? `📡 PIN: ${pinCode} | ` : ''}{peerStatus}
          </span>
        </div>
        
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg">
          <button onClick={() => setVue('public')} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${vue==='public' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}>
            Affichage Public
          </button>
          <button onClick={() => setVue('arbitre')} className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-all ${vue==='arbitre' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}>
            Console Arbitre
          </button>
        </div>
      </div>

      {/* CONTENT WRAPPER */}
      <div className="pt-[52px]">
        {vue === 'public' && (
          <div className="relative h-[calc(100vh-52px)] overflow-hidden">
            <VuePublique state={state} />
            {!isLinked && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-40">
                <form onSubmit={connectToReferee} className="bg-white/10 p-8 rounded-3xl backdrop-blur-xl max-w-sm w-full text-center border border-white/20 shadow-2xl">
                  <div className="text-5xl mb-6">{peerStatus === 'Connexion au serveur...' || peerStatus === 'Recherche Console...' ? '🔄' : '📡'}</div>
                  <h2 className="title-font text-3xl text-white mb-2">Associer l'écran</h2>
                  <p className="text-sm font-medium text-white/60 mb-8">Entrez le code PIN affiché sur la console arbitre.</p>
                  
                  <input 
                    type="text" 
                    value={inputPin} 
                    onChange={e => { setInputPin(e.target.value.replace(/\D/g,'')); setPeerStatus('Déconnecté'); }} 
                    className="w-full px-4 py-4 rounded-xl border-2 border-white/20 bg-black/50 text-center text-5xl tracking-[0.3em] font-bold outline-none transition-colors mb-4 focus:border-blue-500 text-white placeholder-white/20"
                    placeholder="PIN"
                    maxLength={4}
                    autoFocus
                  />
                  
                  <button type="submit" disabled={!inputPin || peerStatus.includes('...')} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all shadow-lg text-lg tracking-widest uppercase">
                    Connecter
                  </button>
                  {peerStatus !== 'Déconnecté' && <p className="mt-4 text-white font-bold animate-pulse">{peerStatus}</p>}
                </form>
              </div>
            )}
          </div>
        )}
        
        {vue === 'arbitre' && !estAdmin && (
          <div className="min-h-[calc(100vh-52px)] bg-slate-50 flex items-center justify-center p-4">
            <form onSubmit={handleLogin} className="bg-white p-8 rounded-3xl shadow-xl max-w-sm w-full text-center border border-slate-100">
              <div className="text-5xl mb-6">🔒</div>
              <h2 className="title-font text-3xl text-slate-800 mb-2">Accès Arbitre</h2>
              <p className="text-sm font-medium text-slate-500 mb-8">Veuillez entrer le mot de passe administrateur.</p>
              
              <input 
                type="password" 
                value={mdp} 
                onChange={e => { setMdp(e.target.value); setErreurMdp(false); }} 
                className={`w-full px-4 py-4 rounded-xl border-2 bg-slate-50 text-center text-3xl tracking-[0.3em] font-bold outline-none transition-colors mb-4 focus:bg-white ${erreurMdp ? 'border-red-400 text-red-600 focus:border-red-500' : 'border-slate-200 focus:border-blue-500 text-slate-800'}`}
                placeholder="••••"
                autoFocus
              />
              
              {erreurMdp && <p className="text-red-500 text-xs font-bold uppercase tracking-widest mb-4">Mot de passe incorrect</p>}
              
              <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-4 rounded-xl transition-transform hover:-translate-y-1 active:translate-y-0 shadow-lg shadow-slate-900/20 text-lg">
                Déverrouiller
              </button>
            </form>
          </div>
        )}

        {vue === 'arbitre' && estAdmin && <VueArbitre state={state} dispatch={dispatch} />}
      </div>
    </div>
  )
}
