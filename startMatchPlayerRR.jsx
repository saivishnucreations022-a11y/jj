import React, { useState, useEffect, Component,useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { runTransaction } from "firebase/firestore";
import HeaderComponent from '../../components/kumar/startMatchHeader';
import backButton from '../../assets/kumar/right-chevron.png';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { Player } from '@lottiefiles/react-lottie-player';
import { db, auth } from '../../../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc, Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { arrayUnion, increment } from 'firebase/firestore';
import sixAnimation from '../../assets/Animation/six.json';
import fourAnimation from '../../assets/Animation/four.json';
import outAnimation from '../../assets/Animation/out.json';
import MainWheel from "../../components/yogesh/wagonwheel/mainwheel"
import AIMatchCompanionModal from "../../components/yogesh/LandingPage/AIMatchCompanion";


// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return (
      <div className="text-white text-center p-4">
        <h1>Something went wrong.</h1>
        <p>{this.state.error?.message || 'Unknown error'}</p>
      </div>
    );
    return this.props.children;
  }
}

// ─── SESSION STORAGE HELPERS ──────────────────────────────────────────────────
const SESSION_KEY = 'matchRouteState';


function saveRouteStateToSession(state) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch (e) { console.warn('Could not save route state to localStorage', e); }
}

function loadRouteStateFromSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ─── All helper async functions (UNCHANGED) ───────────────────────────────────
async function updatePlayerCareerStats(playerName, statUpdates, db) {
  try {
    const q = query(collection(db, "PlayerDetails"), where("name", "==", playerName));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docRef = querySnapshot.docs[0].ref;
      const playerData = querySnapshot.docs[0].data();
      let firestoreUpdates = {};
      Object.entries(statUpdates).forEach(([statPath, valueToAdd]) => {
        const pathSegments = statPath.split(".");
        let currentVal = playerData;
        for (let seg of pathSegments) {
          currentVal = currentVal && typeof currentVal === "object" ? currentVal[seg] : undefined;
        }
        firestoreUpdates[statPath] = (parseInt(currentVal) || 0) + valueToAdd;
      });
      await updateDoc(docRef, firestoreUpdates);
    }
  } catch (error) { console.error("Error updating player stats:", error); }
}

async function updateMatchesForAllPlayers(teamAPlayers, teamBPlayers, db) {
  const allPlayers = [...teamAPlayers, ...teamBPlayers];
  for (const player of allPlayers) {
    await updatePlayerCareerStats(player.name, { 'matches': 1 }, db);
  }
}

async function updatePlayerBattingAverage(playerName, db) {
  try {
    const q = query(collection(db, "PlayerDetails"), where("name", "==", playerName));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docRef = querySnapshot.docs[0].ref;
      const playerData = querySnapshot.docs[0].data();
      const runs = playerData?.careerStats?.batting?.runs || 0;
      const dismissals = playerData?.careerStats?.batting?.dismissals || 0;
      const battingAverage = dismissals > 0 ? runs / dismissals : 0;
      await updateDoc(docRef, { "careerStats.batting.average": battingAverage });
    }
  } catch (error) { console.error("Error updating batting average:", error); }
}

async function updatePlayerBowlingAverage(playerName, db) {
  try {
    const q = query(collection(db, "PlayerDetails"), where("name", "==", playerName));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docRef = querySnapshot.docs[0].ref;
      const playerData = querySnapshot.docs[0].data();
      const runsConceded = playerData?.careerStats?.bowling?.runsConceded || 0;
      const wickets = playerData?.careerStats?.bowling?.wickets || 0;
      const bowlingAverage = wickets > 0 ? runsConceded / wickets : 0;
      await updateDoc(docRef, { "careerStats.bowling.average": bowlingAverage });
    }
  } catch (error) { console.error("Error updating bowling average:", error); }
}

async function initializeTournamentStats(tournamentId, matchId, allPlayers, db) {
  try {
    const matchStatsRef = doc(db, "tournamentStats", tournamentId, "matches", matchId);
    const matchDoc = await getDoc(matchStatsRef);
    if (matchDoc.exists()) return;
    const defaultPlayerStats = allPlayers.map(player => ({
      playerName: player.name, playerIndex: player.index || "unknown",
      runs: 0, wickets: 0, catches: 0, runOuts: 0, stumpings: 0, dismissals: 0,
      ballsFaced: 0, ballsBowled: 0, runsConceded: 0, battingAverage: 0, bowlingAverage: 0, strikeRate: 0,
    }));
    await setDoc(matchStatsRef, { players: defaultPlayerStats });
  } catch (error) { console.error("Error initializing tournament stats:", error); }
}

async function updateTournamentBatting(tournamentId, matchId, playerName, rawUpdates, db) {
  const matchStatsRef = doc(db, "tournamentStats", tournamentId, "matches", matchId);
  try {
    await runTransaction(db, async (transaction) => {
      const matchDoc = await transaction.get(matchStatsRef);
      if (!matchDoc.exists()) throw new Error("Match stats not found for update.");
      const data = matchDoc.data();
      const updatedPlayers = data.players.map(p => {
        if (p.playerName === playerName) {
          const incremented = { ...p };
          Object.entries(rawUpdates).forEach(([key, valueToAdd]) => {
            incremented[key] = (incremented[key] || 0) + valueToAdd;
          });
          const battingAverage = incremented.dismissals > 0 ? (incremented.runs / incremented.dismissals).toFixed(2) : 0;
          const strikeRate = incremented.ballsFaced > 0 ? ((incremented.runs / incremented.ballsFaced) * 100).toFixed(2) : 0;
          return { ...incremented, battingAverage, strikeRate };
        }
        return p;
      });
      transaction.update(matchStatsRef, { players: updatedPlayers });
    });
  } catch (error) { console.error("Transaction failed:", error); }
}

async function updateTournamentBowling(tournamentId, matchId, playerName, rawUpdates, db) {
  const matchStatsRef = doc(db, 'tournamentStats', tournamentId, 'matches', matchId);
  try {
    await runTransaction(db, async (transaction) => {
      const matchDoc = await transaction.get(matchStatsRef);
      let updatedPlayers = [];
      if (!matchDoc.exists()) {
        transaction.set(matchStatsRef, { players: [] });
        updatedPlayers = [];
      } else {
        updatedPlayers = matchDoc.data().players;
      }
      updatedPlayers = updatedPlayers.map(p => {
        if (p.playerName === playerName) {
          const incremented = { ...p };
          Object.entries(rawUpdates).forEach(([key, valueToAdd]) => {
            incremented[key] = (incremented[key] || 0) + valueToAdd;
          });
          const bowlingAverage = incremented.wickets > 0 ? (incremented.runsConceded / incremented.wickets).toFixed(2) : 0;
          return { ...incremented, bowlingAverage };
        }
        return p;
      });
      transaction.set(matchStatsRef, { players: updatedPlayers }, { merge: true });
    });
  } catch (error) { console.error("Transaction failed:", error); }
}

async function updateTournamentFielding(tournamentId, matchId, playerName, rawUpdates, db) {
  try {
    const matchStatsRef = doc(db, "tournamentStats", tournamentId, "matches", matchId);
    const matchDoc = await getDoc(matchStatsRef);
    if (matchDoc.exists()) {
      const data = matchDoc.data();
      const updatedPlayers = data.players.map(p => {
        if (p.playerName === playerName) {
          const incremented = { ...p };
          Object.entries(rawUpdates).forEach(([key, valueToAdd]) => {
            incremented[key] = (incremented[key] || 0) + valueToAdd;
          });
          return incremented;
        }
        return p;
      });
      await updateDoc(matchStatsRef, { players: updatedPlayers });
    }
  } catch (error) { console.error("Error updating fielding stats:", error); }
}

// ─── Main Component ───────────────────────────────────────────────────────────
function StartMatchPlayersRoundRobin({ initialTeamA, initialTeamB, origin }) {
  const location = useLocation();
  const navigate = useNavigate();

  // ── Resolve route state: prefer location.state, fall back to localStorage ──
  const resolvedState = location.state || loadRouteStateFromSession() || {};

  const originPage = resolvedState.origin;
  const maxOvers = resolvedState.overs;
  const teamA = resolvedState.teamA;
  const teamB = resolvedState.teamB;
  const tournamentId = resolvedState.tournamentId;
  const matchId = resolvedState.matchId;
  const resolvedTournamentId = tournamentId || localStorage.getItem('tournamentId') || '';
  const resolvedMatchId = matchId || localStorage.getItem('matchId') || '';
  const phase = resolvedState.phase;
  const selectedPlayersFromProps = resolvedState.selectedPlayers || { left: [], right: [] };
  const tournamentName = resolvedState.tournamentName;
  const information = resolvedState.information;
  const tossWinner = resolvedState.tossWinner;
  const tossDecision = resolvedState.tossDecision;
  

  // ── Persist route state to localStorage whenever we have valid location.state ──
  useEffect(() => {
    if (location.state?.teamA && location.state?.teamB) {
      saveRouteStateToSession(location.state);
    }
  }, [location.state]);

  // ── All state ────────────────────────────────────────────────────────────
  const [playedOvers, setPlayedOvers] = useState(0);
  const [playedWickets, setPlayedWickets] = useState(0);
  const [currentView, setCurrentView] = useState('start');
  const [showThirdButtonOnly, setShowThirdButtonOnly] = useState(false);
  const [viewHistory, setViewHistory] = useState(['start']);
  const [topPlays, setTopPlays] = useState([]);
  const [currentOverBalls, setCurrentOverBalls] = useState([]);
  const [pastOvers, setPastOvers] = useState([]);
  const [playerScore, setPlayerScore] = useState(0);
  const [outCount, setOutCount] = useState(0);
  const [opponentBallsFaced, setOpponentBallsFaced] = useState(0);
  const [validBalls, setValidBalls] = useState(0);
  const [overNumber, setOverNumber] = useState(1);
  const [striker, setStriker] = useState(null);
  const [nonStriker, setNonStriker] = useState(null);
  const [selectedBowler, setSelectedBowler] = useState(null);
  const [showBowlerDropdown, setShowBowlerDropdown] = useState(false);
  const [showBatsmanDropdown, setShowBatsmanDropdown] = useState(false);
  const [nextBatsmanIndex, setNextBatsmanIndex] = useState(null);
  const [showPastOvers, setShowPastOvers] = useState(false);
  const [selectedBatsmenIndices, setSelectedBatsmenIndices] = useState([]);
  const [isChasing, setIsChasing] = useState(false);
  const [targetScore, setTargetScore] = useState(0);
  const [batsmenScores, setBatsmenScores] = useState({});
  const [batsmenBalls, setBatsmenBalls] = useState({});
  const [batsmenStats, setBatsmenStats] = useState({});
  const [bowlerStats, setBowlerStats] = useState({});
  const [wicketOvers, setWicketOvers] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', message: '' });
  const [gameFinished, setGameFinished] = useState(false);
  const [pendingWide, setPendingWide] = useState(false);
  const [pendingNoBall, setPendingNoBall] = useState(false);
  const [pendingOut, setPendingOut] = useState(false);
  const [activeLabel, setActiveLabel] = useState(null);
  const [activeNumber, setActiveNumber] = useState(null);
  const [showRunInfo, setShowRunInfo] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [animationType, setAnimationType] = useState(null);
  const [pendingLegBy, setPendingLegBy] = useState(false);
  const [firstInningsData, setFirstInningsData] = useState(null);
  const [showMainWheel, setShowMainWheel] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);
  const [showDismissalModal, setShowDismissalModal] = useState(false);
  const [selectedDismissalType, setSelectedDismissalType] = useState('');
  const [selectedCatchType, setSelectedCatchType] = useState('');
  const [selectedInvolvedPlayer, setSelectedInvolvedPlayer] = useState(null);
  const [outRuns, setOutRuns] = useState(null);
  const [outBatsmanType, setOutBatsmanType] = useState('striker');
  const [nextBatsmanEnd, setNextBatsmanEnd] = useState(null);
  const [showLegByModal, setShowLegByModal] = useState(false);
  const [legByBatsmanType, setLegByBatsmanType] = useState('striker');
  const [retiredHurtPlayers, setRetiredHurtPlayers] = useState([]);
  const [showRetiredHurtModal, setShowRetiredHurtModal] = useState(false);
  const [retiredHurtBatsmanType, setRetiredHurtBatsmanType] = useState('striker');
  const [pendingRetiredHurt, setPendingRetiredHurt] = useState(false);
  const [battingTeamPlayers, setBattingTeamPlayers] = useState([]);
  const [bowlingTeamPlayers, setBowlingTeamPlayers] = useState([]);
  const [batsmanHistory, setBatsmanHistory] = useState([]);
  const [isAICompanionOpen, setIsAICompanionOpen] = useState(true);
  const [predictionData, setPredictionData] = useState(null);
  const [currentBattingTeam, setCurrentBattingTeam] = useState(null);
  const [currentBowlingTeam, setCurrentBowlingTeam] = useState(null);
  const [matchTime, setMatchTime] = useState(null);
  const [matchDate, setMatchDate] = useState(null);
  const [isButtonFrozen, setIsButtonFrozen] = useState(false);
  const [showHurryMessage, setShowHurryMessage] = useState(false);
  const [isRestored, setIsRestored] = useState(false); // tracks if reload-restore is done

  // ─── RACE CONDITION FIX: ref to detect when we restored from Firestore ───────
  const isRestoredFromDB = useRef(false); // true when we restored from Firestore on reload

  const dismissalTypes = ['Caught', 'Bowled', 'LBW', 'Run Out', 'Stumped', 'Caught & Bowled', 'Caught Behind'];
  const catchTypes = ['Diving', 'Running', 'Overhead', 'One-handed', 'Standard'];

  useEffect(() => {
    if (tournamentId) localStorage.setItem('tournamentId', tournamentId);
    if (matchId) localStorage.setItem('matchId', matchId);
    if (tournamentId && matchId) localStorage.setItem('currentMatchKey', tournamentId + '_' + matchId);
  }, [tournamentId, matchId]);

  // ── RELOAD RESTORE: Load all match state from Firestore after a page reload ──
  useEffect(() => {
  const loadMatchData = async () => {
    // If we have fresh location.state, no restore needed
    if (location.state?.teamA && location.state?.teamB) {
      setIsRestored(true);
      return;
    }
 
    try {
      // ✅ FIX: Wait for Firebase auth to re-hydrate instead of checking auth.currentUser
      // directly. auth.currentUser is null on page reload until Firebase resolves async.
      const currentUser = await new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
      });
      if (!currentUser) { setIsRestored(true); return; }
 
      const key = localStorage.getItem('currentMatchKey');
      console.log('🔍 RESTORE: localStorage key=', key, 'tournamentId=', localStorage.getItem('tournamentId'), 'matchId=', localStorage.getItem('matchId'));
      if (!key) { console.log('❌ RESTORE: No key found, cannot restore'); setIsRestored(true); return; }
 
      const matchDoc = await getDoc(doc(db, 'scoringpage', key));
      if (!matchDoc.exists()) { setIsRestored(true); return; }
 
      const data = matchDoc.data();
      console.log('🔄 RESTORE: Found Firestore doc, data.player=', data.player, 'firstInnings=', data.firstInnings?.totalScore);

      // ── Restore route-level values from snapshot ──
      const snap = data.routeSnapshot || {};
      // We can't set the route state, but we read them directly from the doc.
      // The component reads these from resolvedState / location.state.
      // After reload those are gone, so we patch them back via localStorage
      // so that the existing resolvedState reads pick them up on next render.
      // Better: push them back into localStorage SESSION_KEY so resolvedState works.
      const existingSession = loadRouteStateFromSession() || {};
      const patchedSession = {
        ...existingSession,
        origin: snap.originPage || existingSession.origin,
        overs: snap.maxOvers || existingSession.overs,
        tournamentId: snap.tournamentId || existingSession.tournamentId,
        matchId: snap.matchId || existingSession.matchId,
        phase: snap.phase || existingSession.phase,
        tournamentName: snap.tournamentName || existingSession.tournamentName,
        tossWinner: snap.tossWinner || existingSession.tossWinner,
        tossDecision: snap.tossDecision || existingSession.tossDecision,
        // Rebuild selectedPlayers from saved team player arrays
        selectedPlayers: {
          left: data.teamA?.players || existingSession.selectedPlayers?.left || [],
          right: data.teamB?.players || existingSession.selectedPlayers?.right || [],
        },
        teamA: data.teamA
          ? { name: data.teamA.name, flagUrl: data.teamA.flagUrl }
          : existingSession.teamA,
        teamB: data.teamB
          ? { name: data.teamB.name, flagUrl: data.teamB.flagUrl }
          : existingSession.teamB,
      };
      saveRouteStateToSession(patchedSession);
 
      const isSecondInnings = !!data.secondInnings;
      const activeInnings = isSecondInnings ? data.secondInnings : data.firstInnings;
 
      // ── Score & over state ──
      setPlayerScore(activeInnings?.totalScore || 0);
      setOutCount(activeInnings?.wickets || 0);
      setIsChasing(isSecondInnings);
 
      if (isSecondInnings) {
        setTargetScore((data.firstInnings?.totalScore || 0) + 1);
        setFirstInningsData(data.firstInnings || null);
      }
 
      // ── Over number & valid balls ──
      if (activeInnings?.overs) {
        const parts = String(activeInnings.overs).split('.');
        const completedOvers = parseInt(parts[0]) || 0;
        const ballsInOver = parseInt(parts[1]) || 0;
        setOverNumber(completedOvers + 1);
        setValidBalls(ballsInOver);
      }
 
      // ── NEW: Restore currentOverBalls and pastOvers ──
      if (Array.isArray(activeInnings?.currentOverBalls)) {
        setCurrentOverBalls(activeInnings.currentOverBalls);
      }
      if (Array.isArray(activeInnings?.pastOvers)) {
        setPastOvers(activeInnings.pastOvers);
      }
      if (Array.isArray(activeInnings?.topPlays)) {
        setTopPlays(activeInnings.topPlays);
      }
 
      // ── Restore current players ──
      if (data.player?.striker) setStriker(data.player.striker);
      if (data.player?.nonStriker) setNonStriker(data.player.nonStriker);
      if (data.player?.bowler) setSelectedBowler(data.player.bowler);
 
      // ── Restore teams ──
      const battingTeamObj = isSecondInnings
        ? { name: data.teamB?.name, flagUrl: data.teamB?.flagUrl }
        : { name: data.teamA?.name, flagUrl: data.teamA?.flagUrl };
      const bowlingTeamObj = isSecondInnings
        ? { name: data.teamA?.name, flagUrl: data.teamA?.flagUrl }
        : { name: data.teamB?.name, flagUrl: data.teamB?.flagUrl };
      setCurrentBattingTeam(battingTeamObj);
      setCurrentBowlingTeam(bowlingTeamObj);
 
      // ── Restore player lists (batting & bowling) ──
      const battingSource = isSecondInnings ? data.teamB : data.teamA;
      const bowlingSource = isSecondInnings ? data.teamA : data.teamB;
 
      if (battingSource?.players?.length) {
        setBattingTeamPlayers(
          battingSource.players.map((p, i) => ({ ...p, index: p.index || p.name + i }))
        );
      }
      if (bowlingSource?.players?.length) {
        setBowlingTeamPlayers(
          bowlingSource.players.map((p, i) => ({ ...p, index: p.index || p.name + i }))
        );
      }
 
      // ── Restore per-batsman stats ──
      if (activeInnings?.playerStats) {
        const restoredBatsmenStats = {};
        const restoredBatsmenScores = {};
        const restoredBatsmenBalls = {};
        const restoredSelectedIndices = [];
        const restoredWickets = [];
 
        activeInnings.playerStats.forEach(p => {
          if (!p.index) return;
          restoredBatsmenStats[p.index] = {
            runs: p.runs || 0,
            balls: p.balls || 0,
            dotBalls: p.dotBalls || 0,
            ones: p.ones || 0,
            twos: p.twos || 0,
            threes: p.threes || 0,
            fours: p.fours || 0,
            sixes: p.sixes || 0,
            milestone: p.milestone || null,
          };
          restoredBatsmenScores[p.index] = p.runs || 0;
          restoredBatsmenBalls[p.index] = p.balls || 0;
 
          // ── NEW: use hasBatted flag so players with 0 runs are not missed ──
          if (p.hasBatted) restoredSelectedIndices.push(p.index);
 
          if (p.dismissalType) {
            restoredWickets.push({
              batsmanIndex: p.index,
              over: p.wicketOver || '0.0',
              dismissalType: p.dismissalType,
              catchType: p.catchType || null,
              involvedPlayer: p.involvedPlayer || null,
            });
          }
        });
 
        setBatsmenStats(restoredBatsmenStats);
        setBatsmenScores(restoredBatsmenScores);
        setBatsmenBalls(restoredBatsmenBalls);
        setSelectedBatsmenIndices(restoredSelectedIndices);
        setWicketOvers(restoredWickets);
      }
 
      // ── Restore bowler stats ──
      if (activeInnings?.bowlerStats) {
        const restoredBowlerStats = {};
        activeInnings.bowlerStats.forEach(p => {
          if (!p.index) return;
          // Recalculate ballsBowled from oversBowled string e.g. "2.4" → 16 balls
          const [ov = '0', bl = '0'] = String(p.oversBowled || '0.0').split('.');
          const ballsBowled = parseInt(ov) * 6 + parseInt(bl);
          restoredBowlerStats[p.index] = {
            wickets: p.wickets || 0,
            ballsBowled,
            oversBowled: p.oversBowled || '0.0',
            runsConceded: p.runsConceded || 0,
          };
        });
        setBowlerStats(restoredBowlerStats);
      }
 
      // ── NEW: Restore retired-hurt players ──
      if (Array.isArray(activeInnings?.retiredHurtPlayers)) {
        setRetiredHurtPlayers(activeInnings.retiredHurtPlayers);
      }

      // ─── RACE CONDITION FIX STEP 2: set ref before setIsRestored(true) ───────
      isRestoredFromDB.current = true;
      console.log('✅ RESTORE COMPLETE: score=', activeInnings?.totalScore, 'striker=', data.player?.striker?.name, 'bowler=', data.player?.bowler?.name, 'battingPlayers=', battingSource?.players?.length);
    } catch (err) {
      console.error('Restore error:', err);
    } finally {
      setIsRestored(true);
    }
  };
 
  loadMatchData();
}, []); // run once on mount

  // beforeunload removed - Firestore saves data on every ball

  useEffect(() => {
    const winA = Math.max(0, 100 - (playerScore + outCount * 5));
    const winB = 100 - winA;
    setPredictionData({
      Chasing: isChasing, TeamA: teamA?.name, TeamB: teamB?.name,
      battingScore: playerScore, bowlingScore: targetScore, winA, winB,
      tournamentId, overNumber, wicketsFallen: outCount,
      nextOverProjection: `Predicted 8 runs with 1 boundary in Over ${overNumber}`,
      alternateOutcome: `If ${striker?.name || "the striker"} hits a 6 next ball, win probability increases by 5%.`,
    });
  }, [playerScore, outCount, overNumber, validBalls, isChasing]);

  useEffect(() => {
    const fetchMatchDetails = async () => {
      try {
        const roundRobinRef = doc(db, "roundrobin", tournamentId);
        const roundRobinSnap = await getDoc(roundRobinRef);
        if (roundRobinSnap.exists()) {
          const matchSchedule = roundRobinSnap.data().matchSchedule || [];
          const currentMatch = matchSchedule.find((ms) => ms.matchId === matchId);
          if (currentMatch) { setMatchTime(currentMatch.time || null); setMatchDate(currentMatch.date || null); }
        }
      } catch (error) { console.error("Error fetching match details:", error); }
    };
    fetchMatchDetails();
  }, []);

  // removed premature on-mount save - it overwrote Firestore with empty state

  useEffect(() => {
    if (!isRestored) return;
    const mid = resolvedMatchId || matchId;
    // ✅ CRITICAL FIX: Only save when we actually have players set up.
    // Without this guard, when the restore useEffect fails (e.g. auth not ready yet),
    // isRestored becomes true with all state empty, and this save immediately fires
    // and OVERWRITES the good Firestore data with blank data — destroying the match.
    const hasMatchData = battingTeamPlayers.length > 0 && bowlingTeamPlayers.length > 0;
    if (!gameFinished && mid && hasMatchData) saveMatchData();
  }, [playerScore, currentOverBalls, outCount, validBalls, overNumber, isChasing, striker, nonStriker, selectedBowler, batsmenStats, bowlerStats, wicketOvers, isRestored]);

  // ─── RACE CONDITION FIX STEP 3: Replace team/player init useEffect ───────────
  // Skip entirely if we just restored from Firestore (isRestoredFromDB is true after
  // a page reload that successfully loaded data). Also skip if location.state is
  // missing (reload without saved data).
  useEffect(() => {
    // ── Skip entirely if we just restored from Firestore ──
    if (isRestoredFromDB.current) return;

    // ── Also skip if location.state is missing (reload without saved data) ──
    if (!location.state?.teamA || !location.state?.teamB) return;

    if (!teamA || !teamB || !selectedPlayersFromProps.left || !selectedPlayersFromProps.right || !tournamentId || !matchId || !phase) {
      navigate('/'); return;
    }

    let initialBattingPlayers = selectedPlayersFromProps.left;
    let initialBowlingPlayers = selectedPlayersFromProps.right;
    let initialBattingTeam = teamA;
    let initialBowlingTeam = teamB;

    if (tossWinner && tossDecision) {
      if (tossWinner === teamA.name) {
        if (tossDecision === 'Bowling') {
          initialBattingTeam = teamB; initialBowlingTeam = teamA;
          initialBattingPlayers = selectedPlayersFromProps.right;
          initialBowlingPlayers = selectedPlayersFromProps.left;
        }
      } else if (tossWinner === teamB.name) {
        if (tossDecision === 'Batting') {
          initialBattingTeam = teamB; initialBowlingTeam = teamA;
          initialBattingPlayers = selectedPlayersFromProps.right;
          initialBowlingPlayers = selectedPlayersFromProps.left;
        }
      }
    }

    if (!isChasing) {
      setCurrentBattingTeam(initialBattingTeam);
      setCurrentBowlingTeam(initialBowlingTeam);
      setBattingTeamPlayers(initialBattingPlayers.map((p, i) => ({ ...p, index: p.name + i, photoUrl: p.photoUrl })));
      setBowlingTeamPlayers(initialBowlingPlayers.map((p, i) => ({ ...p, index: p.name + i, photoUrl: p.photoUrl })));
    } else {
      setCurrentBattingTeam(initialBowlingTeam);
      setCurrentBowlingTeam(initialBattingTeam);
      setBattingTeamPlayers(initialBowlingPlayers.map((p, i) => ({ ...p, index: p.name + i, photoUrl: p.photoUrl })));
      setBowlingTeamPlayers(initialBattingPlayers.map((p, i) => ({ ...p, index: p.name + i, photoUrl: p.photoUrl })));
    }

    setStriker(null); setNonStriker(null); setSelectedBowler(null);
    setSelectedBatsmenIndices([]); setBatsmenScores({}); setBatsmenBalls({});
    setBatsmenStats({}); setBowlerStats({}); setWicketOvers([]); setRetiredHurtPlayers([]);

    const allPlayers = [...selectedPlayersFromProps.left, ...selectedPlayersFromProps.right];
    initializeTournamentStats(tournamentId, matchId, allPlayers, db);

  }, [isChasing, selectedPlayersFromProps, teamA, teamB, navigate, tournamentId, matchId, phase, tossWinner, tossDecision]);

  // ── All handler functions (UNCHANGED) ───────────────────────────────────
  const displayModal = (title, message) => { setModalContent({ title, message }); setShowModal(true); };
  const handleButtonClick = (view) => { setCurrentView(view); setShowThirdButtonOnly(view === 'start'); setViewHistory(prev => [...prev, view]); };

  const goBack = () => {
    if (gameFinished && showModal) return;
    if (showDismissalModal) { setShowDismissalModal(false); setSelectedDismissalType(''); setSelectedCatchType(''); setSelectedInvolvedPlayer(null); setOutRuns(null); return; }
    if (showBowlerDropdown) { setShowBowlerDropdown(false); return; }
    if (showBatsmanDropdown) { cancelBatsmanDropdown(); return; }
    if (viewHistory.length > 1) {
      const newHistory = [...viewHistory]; newHistory.pop();
      const previousView = newHistory[newHistory.length - 1];
      setViewHistory(newHistory); setCurrentView(previousView); setShowThirdButtonOnly(previousView === 'start');
    } else { navigate(-1); }
  };

  const updateBatsmanScore = async (batsmanIndex, runs) => {
    setBatsmenScores(prev => ({ ...prev, [batsmanIndex]: (prev[batsmanIndex] || 0) + runs }));
    const player = battingTeamPlayers.find(p => p.index === batsmanIndex);
    if (player) await updatePlayerCareerStats(player.name, { "careerStats.batting.runs": runs }, db);
  };

  const updateBatsmanBalls = async (batsmanIndex, inc = 1) => {
    setBatsmenBalls(prev => ({ ...prev, [batsmanIndex]: Math.max(0, (prev[batsmanIndex] || 0) + inc) }));
    const player = battingTeamPlayers.find(p => p.index === batsmanIndex);
    if (player) await updatePlayerCareerStats(player.name, { "careerStats.batting.innings": 1 }, db);
  };

  const updateBatsmanStats = async (batsmanIndex, runs, isDotBall = false) => {
    let newRuns = 0; let currentStats = {};
    setBatsmenStats(prev => {
      currentStats = prev[batsmanIndex] || { runs: 0, balls: 0, dotBalls: 0, ones: 0, twos: 0, threes: 0, fours: 0, sixes: 0, milestone: null };
      newRuns = currentStats.runs + runs;
      let milestone = currentStats.milestone;
      if (newRuns >= 100 && currentStats.runs < 100) milestone = 100;
      else if (newRuns >= 50 && currentStats.runs < 50) milestone = 50;
      return { ...prev, [batsmanIndex]: { ...currentStats, runs: newRuns, balls: currentStats.balls + (isDotBall || runs > 0 ? 1 : 0), dotBalls: isDotBall ? currentStats.dotBalls + 1 : currentStats.dotBalls, ones: runs === 1 ? currentStats.ones + 1 : currentStats.ones, twos: runs === 2 ? currentStats.twos + 1 : currentStats.twos, threes: runs === 3 ? currentStats.threes + 1 : currentStats.threes, fours: runs === 4 ? currentStats.fours + 1 : currentStats.fours, sixes: runs === 6 ? currentStats.sixes + 1 : currentStats.sixes, milestone } };
    });
    const player = battingTeamPlayers.find(p => p.index === batsmanIndex);
    if (player) {
      await updateTournamentBatting(tournamentId, matchId, player.name, { runs, ballsFaced: 1 }, db);
      await updatePlayerCareerStats(player.name, { "careerStats.batting.runs": runs, "careerStats.batting.fours": runs === 4 ? 1 : 0, "careerStats.batting.sixes": runs === 6 ? 1 : 0, "careerStats.batting.innings": (isDotBall || runs > 0) ? 1 : 0 }, db);
      await updatePlayerBattingAverage(player.name, db);
    }
  };

  const updateBowlerStats = async (bowlerIndex, isWicket = false, isValidBall = false, runsConceded = 0) => {
    setBowlerStats(prev => {
      const currentBowler = prev[bowlerIndex] || { wickets: 0, ballsBowled: 0, oversBowled: '0.0', runsConceded: 0 };
      const ballsBowled = currentBowler.ballsBowled + (isValidBall ? 1 : 0);
      const overs = Math.floor(ballsBowled / 6) + (ballsBowled % 6) / 10;
      return { ...prev, [bowlerIndex]: { wickets: isWicket ? (currentBowler.wickets || 0) + 1 : currentBowler.wickets || 0, ballsBowled, oversBowled: overs.toFixed(1), runsConceded: (currentBowler.runsConceded || 0) + runsConceded } };
    });
    const player = bowlingTeamPlayers.find(p => p.index === bowlerIndex);
    if (player) {
      await updateTournamentBowling(tournamentId, matchId, player.name, { wickets: isWicket ? 1 : 0, ballsBowled: isValidBall ? 1 : 0, runsConceded }, db);
      await updatePlayerCareerStats(player.name, { "careerStats.bowling.wickets": isWicket ? 1 : 0, "careerStats.bowling.runsConceded": runsConceded }, db);
      await updatePlayerBowlingAverage(player.name, db);
    }
  };

  const recordDismissal = async (batsmanIndex, dismissalType, catchType = null, involvedPlayer = null) => {
    const currentOver = `${overNumber - 1}.${validBalls + 1}`;
    setWicketOvers(prev => [...prev, { batsmanIndex, over: currentOver, dismissalType, catchType, involvedPlayer: involvedPlayer ? { name: involvedPlayer.name, index: involvedPlayer.index } : null }]);
    const batsman = battingTeamPlayers.find(p => p.index === batsmanIndex);
    if (batsman) {
      await updateTournamentBatting(tournamentId, matchId, batsman.name, { dismissals: 1 }, db);
      await updatePlayerCareerStats(batsman.name, { "careerStats.batting.dismissals": 1 }, db);
      await updatePlayerBattingAverage(batsman.name, db);
    }
    if (involvedPlayer) {
      let fieldingUpdate = {};
      if (['Caught', 'Caught Behind', 'Caught & Bowled'].includes(dismissalType)) fieldingUpdate = { catches: 1 };
      else if (dismissalType === 'Stumped') fieldingUpdate = { stumpings: 1 };
      else if (dismissalType === 'Run Out') fieldingUpdate = { runOuts: 1 };
      await updateTournamentFielding(tournamentId, matchId, involvedPlayer.name, fieldingUpdate, db);
    }
    let isBowlerWicket = ['Caught', 'Caught Behind', 'Caught & Bowled', 'Bowled', 'LBW', 'Stumped'].includes(dismissalType);
    if (isBowlerWicket && selectedBowler) await updateBowlerStats(selectedBowler.index, true, true, 0);
  };

  const playAnimation = (type) => { setAnimationType(type); setShowAnimation(true); setTimeout(() => setShowAnimation(false), 3000); };

  const saveMatchData = async (isFinal = false) => {
  try {
    if (!auth.currentUser) return;
 
    const overs = `${overNumber - 1}.${validBalls}`;
 
    const playerStats = battingTeamPlayers.map(player => {
      const stats = batsmenStats[player.index] || {};
      const wicket = wicketOvers.find(w => w.batsmanIndex === player.index);
      return {
        index: player.index || '',
        name: player.name || 'Unknown',
        photoUrl: player.photoUrl || '',
        role: player.role || '',
        runs: stats.runs || 0,
        balls: stats.balls || 0,
        dotBalls: stats.dotBalls || 0,
        ones: stats.ones || 0,
        twos: stats.twos || 0,
        threes: stats.threes || 0,
        fours: stats.fours || 0,
        sixes: stats.sixes || 0,
        milestone: stats.milestone || null,
        wicketOver: wicket ? wicket.over : null,
        dismissalType: wicket?.dismissalType || null,
        catchType: wicket?.catchType || null,
        involvedPlayer: wicket?.involvedPlayer || null,
        // ── NEW: track whether this player has batted at all ──
        hasBatted: selectedBatsmenIndices.includes(player.index),
      };
    });
 
    const bowlerStatsArray = bowlingTeamPlayers.map(player => {
      const stats = bowlerStats[player.index] || {};
      return {
        index: player.index || '',
        name: player.name || 'Unknown',
        photoUrl: player.photoUrl || '',
        role: player.role || '',
        wickets: stats.wickets || 0,
        oversBowled: stats.oversBowled || '0.0',
        runsConceded: stats.runsConceded || 0,
      };
    });
 
    const activeInningsData = {
      teamName: currentBattingTeam?.name || '',
      totalScore: playerScore,
      wickets: outCount,
      overs,
      playerStats,
      bowlerStats: bowlerStatsArray,
      // ── NEW: persist over-by-over ball data ──
      currentOverBalls: currentOverBalls,
      pastOvers: pastOvers,
      topPlays: topPlays,
      // ── NEW: persist retired-hurt list ──
      retiredHurtPlayers: retiredHurtPlayers.map(p => ({
        name: p.name, index: p.index, role: p.role || '', photoUrl: p.photoUrl || '',
      })),
    };
 
    const matchData = {
      matchId,
      tournamentId,
      userId: auth.currentUser.uid,
      createdAt: Timestamp.fromDate(new Date()),
      tournamentName,
      umpire: 'naga',
      phase: phase || 'Unknown',
      Format: maxOvers,
      // ── NEW: store full team objects so restore can rebuild player lists ──
      teamA: {
        name: teamA?.name || currentBattingTeam?.name || 'Team A',
        flagUrl: teamA?.flagUrl || currentBattingTeam?.flagUrl || '',
        players: (isChasing ? bowlingTeamPlayers : battingTeamPlayers).map(p => ({
          name: p.name || 'Unknown',
          index: p.index || '',
          photoUrl: p.photoUrl || '',
          role: p.role || '',
        })),
        totalScore: isChasing ? (firstInningsData?.totalScore || 0) : playerScore,
        wickets: isChasing ? (firstInningsData?.wickets || 0) : outCount,
        overs: isChasing ? (firstInningsData?.overs || '0.0') : overs,
        result: isFinal
          ? (playerScore < targetScore - 1 ? 'Win' : playerScore === targetScore - 1 ? 'Tie' : 'Loss')
          : null,
      },
      teamB: {
        name: teamB?.name || currentBowlingTeam?.name || 'Team B',
        flagUrl: teamB?.flagUrl || currentBowlingTeam?.flagUrl || '',
        players: (isChasing ? battingTeamPlayers : bowlingTeamPlayers).map(p => ({
          name: p.name || 'Unknown',
          index: p.index || '',
          photoUrl: p.photoUrl || '',
          role: p.role || '',
        })),
        totalScore: isChasing ? playerScore : (firstInningsData?.totalScore || 0),
        wickets: isChasing ? outCount : (firstInningsData?.wickets || 0),
        overs: isChasing ? overs : (firstInningsData?.overs || '0.0'),
        result: isFinal
          ? (playerScore < targetScore - 1 ? 'Loss' : playerScore === targetScore - 1 ? 'Tie' : 'Win')
          : null,
      },
      firstInnings: firstInningsData || activeInningsData,
      secondInnings: isChasing ? activeInningsData : null,
      matchResult: isFinal
        ? (playerScore < targetScore - 1
          ? teamA?.name || 'Team A'
          : playerScore === targetScore - 1
            ? 'Tie'
            : teamB?.name || 'Team B')
        : null,
      player: {
        striker: striker ? { name: striker.name, index: striker.index, role: striker.role, photoUrl: striker.photoUrl || '' } : null,
        nonStriker: nonStriker ? { name: nonStriker.name, index: nonStriker.index, role: nonStriker.role, photoUrl: nonStriker.photoUrl || '' } : null,
        bowler: selectedBowler ? { name: selectedBowler.name, index: selectedBowler.index, role: selectedBowler.role, photoUrl: selectedBowler.photoUrl || '' } : null,
      },
      // ── NEW: snapshot of route-level data so restore works without location.state ──
      routeSnapshot: {
        originPage: originPage || null,
        maxOvers: maxOvers || 0,
        tournamentId: tournamentId || '',
        matchId: matchId || '',
        phase: phase || '',
        tournamentName: tournamentName || '',
        tossWinner: tossWinner || null,
        tossDecision: tossDecision || null,
        isChasing,
        targetScore,
      },
      time: matchTime,
      date: matchDate,
      status: isFinal ? 'past' : 'live',
    };
 
    const docKey = `${resolvedTournamentId}_${resolvedMatchId}`;
    localStorage.setItem('currentMatchKey', docKey);
    console.log('💾 SAVING to Firestore key=', docKey, 'score=', playerScore, 'striker=', striker?.name, 'teamA.players=', (isChasing ? bowlingTeamPlayers : battingTeamPlayers).length);
    await setDoc(doc(db, 'scoringpage', docKey), matchData);
  } catch (error) {
    console.error('Error saving match data:', error);
  }
};
 

  const handleScoreButtonClick = (value, isLabel) => {
    if (!striker || !nonStriker || !selectedBowler) return;
    if (gameFinished) return;
    if (!isLabel && typeof value === 'number' && [0, 1, 2, 3, 4, 5, 6].includes(value)) {
      if (isButtonFrozen) { setShowHurryMessage(true); setTimeout(() => setShowHurryMessage(false), 2000); return; }
      setIsButtonFrozen(true); setTimeout(() => setIsButtonFrozen(false), 2000);
    }
    let runsToAdd = 0; let isValidBall = false;
    if (isLabel) { setActiveNumber(null); setActiveLabel(value); } else { setActiveLabel(null); setActiveNumber(value); }

    if (pendingWide && !isLabel && typeof value === 'number') {
      runsToAdd = value + 1; setPlayerScore(prev => prev + runsToAdd);
      setTopPlays(prev => [...prev, `W${value}`]); setCurrentOverBalls(prev => [...prev, `W${value}`]);
      if (striker) { updateBatsmanScore(striker.index, value + 1); updateBatsmanStats(striker.index, value + 1); }
      if (selectedBowler) updateBowlerStats(selectedBowler.index, false, false, runsToAdd);
      setPendingWide(false); return;
    }
    if (pendingNoBall && !isLabel && typeof value === 'number') {
      runsToAdd = value + 1; setPlayerScore(prev => prev + runsToAdd);
      setTopPlays(prev => [...prev, `NB${value}`]); setCurrentOverBalls(prev => [...prev, `NB${value}`]);
      if (striker) { updateBatsmanScore(striker.index, value + 1); updateBatsmanStats(striker.index, value + 1); }
      if (selectedBowler) updateBowlerStats(selectedBowler.index, false, false, runsToAdd);
      setPendingNoBall(false); return;
    }
    if (pendingLegBy && !isLabel && typeof value === 'number') {
      runsToAdd = value; setPlayerScore(prev => prev + runsToAdd);
      setTopPlays(prev => [...prev, `L${value}`]); setCurrentOverBalls(prev => [...prev, `L${value}`]);
      setValidBalls(prev => prev + 1);
      const legByBatsmanIndex = legByBatsmanType === 'striker' ? striker.index : nonStriker.index;
      updateBatsmanBalls(legByBatsmanIndex);
      if (selectedBowler) updateBowlerStats(selectedBowler.index, false, true, runsToAdd);
      if (value % 2 !== 0) { const temp = striker; setStriker(nonStriker); setNonStriker(temp); }
      setPendingLegBy(false); setLegByBatsmanType('striker'); return;
    }
    if (pendingOut && !isLabel && typeof value === 'number') {
      if (value !== 0 && value !== 1 && value !== 2) return;
      setOutRuns(value); playAnimation('out');
      setTimeout(() => setShowDismissalModal(true), 3000); return;
    }
    if (pendingRetiredHurt) return;

    if (isLabel) {
      if (['Wide', 'No-ball', 'Leg By', 'OUT', 'Retired Hurt'].includes(value)) setShowRunInfo(true);
      else setShowRunInfo(false);
      if (value === 'Wide') { setPendingWide(true); return; }
      else if (value === 'No-ball') { setPendingNoBall(true); return; }
      else if (value === 'Leg By') { setShowLegByModal(true); return; }
      else if (value === 'OUT' || value === 'Wicket' || value === 'lbw') { setPendingOut(true); return; }
      else if (value === 'Retired Hurt') { setShowRetiredHurtModal(true); return; }
      if (!['No-ball', 'Wide', 'No ball'].includes(value)) {
        setValidBalls(prev => prev + 1);
        if (striker && value !== 'Wide' && value !== 'No-ball') updateBatsmanBalls(striker.index);
      }
    } else {
      setShowRunInfo(false);
      runsToAdd = value; setPlayerScore(prev => prev + runsToAdd);
      setTopPlays(prev => [...prev, value]); setCurrentOverBalls(prev => [...prev, value]);
      setValidBalls(prev => prev + 1); isValidBall = true;
      if (striker) { updateBatsmanScore(striker.index, value); updateBatsmanStats(striker.index, value, value === 0); updateBatsmanBalls(striker.index); }
      if (selectedBowler) updateBowlerStats(selectedBowler.index, false, true, runsToAdd);
      if (value % 2 !== 0) { const temp = striker; setStriker(nonStriker); setNonStriker(temp); }
      if (value === 6) playAnimation('six');
      else if (value === 4) playAnimation('four');
      if (!pendingOut && !pendingWide && !pendingNoBall && !pendingLegBy && value !== 0) { setSelectedRun(value); setShowMainWheel(true); }
    }
  };

  const handleLegByModalSubmit = () => { if (!legByBatsmanType) return; setPendingLegBy(true); setShowLegByModal(false); setShowRunInfo(true); };

  const handleRetiredHurtModalSubmit = () => {
    if (!retiredHurtBatsmanType) return;
    const retiredBatsman = retiredHurtBatsmanType === 'striker' ? striker : nonStriker;
    setRetiredHurtPlayers(prev => [...prev, retiredBatsman]);
    if (retiredHurtBatsmanType === 'striker') { setStriker(null); setNextBatsmanEnd('striker'); }
    else { setNonStriker(null); setNextBatsmanEnd('non-striker'); }
    setShowRetiredHurtModal(false); setShowBatsmanDropdown(true);
    setCurrentOverBalls(prev => [...prev, 'RH']); setTopPlays(prev => [...prev, 'RH']); setValidBalls(prev => prev + 1);
  };

  const handleDismissalModalSubmit = () => {
    if (!selectedDismissalType) return;
    let isValid = true;
    if (['Caught', 'Caught Behind'].includes(selectedDismissalType)) { if (!selectedCatchType || !selectedInvolvedPlayer) isValid = false; }
    else if (['Run Out', 'Stumped'].includes(selectedDismissalType)) { if (!selectedInvolvedPlayer) isValid = false; }
    if (!isValid) return;
    playAnimation('out');
    setTimeout(() => {
      setPlayerScore(prev => prev + outRuns);
      let displayText = `O${outRuns} ${selectedDismissalType}`;
      if (selectedCatchType) displayText += ` - ${selectedCatchType}`;
      setTopPlays(prev => [...prev, displayText]); setCurrentOverBalls(prev => [...prev, displayText]);
      let outBatsman = outBatsmanType === 'striker' ? striker : nonStriker;
      const batsmanIndex = outBatsman.index;
      updateBatsmanScore(batsmanIndex, outRuns); updateBatsmanStats(batsmanIndex, outRuns, outRuns === 0); updateBatsmanBalls(batsmanIndex);
      recordDismissal(batsmanIndex, selectedDismissalType, selectedCatchType, selectedInvolvedPlayer);
      setValidBalls(prev => prev + 1); setOutCount(prev => prev + 1);
      setBatsmanHistory(prev => [...prev, { striker, nonStriker, outBatsmanType }]);
      let positionToRemove = outBatsmanType;
      if (outRuns % 2 !== 0) { const temp = striker; setStriker(nonStriker); setNonStriker(temp); positionToRemove = positionToRemove === 'striker' ? 'non-striker' : 'striker'; }
      if (positionToRemove === 'striker') setStriker(null); else setNonStriker(null);
      setNextBatsmanEnd(positionToRemove);
      const availableBatsmen = getAvailableBatsmen();
      setShowDismissalModal(false); setPendingOut(false); setSelectedDismissalType(''); setSelectedCatchType(''); setSelectedInvolvedPlayer(null); setOutRuns(null); setOutBatsmanType('striker');
      if (availableBatsmen.length > 0) setShowBatsmanDropdown(true);
    }, 1000);
  };

  const handleUndoBall = async () => {
    if (currentOverBalls.length === 0) {
      if (pastOvers.length === 0) return;
      const lastOver = pastOvers.pop();
      setCurrentOverBalls(lastOver); setPastOvers([...pastOvers]); setOverNumber(prev => prev - 1);
      const lastBall = lastOver.pop(); setCurrentOverBalls([...lastOver]);
      let runs = 0; let isValid = false; let isWicket = false;
      if (typeof lastBall === 'number') { runs = lastBall; isValid = true; if (runs % 2 !== 0) { const temp = striker; setStriker(nonStriker); setNonStriker(temp); } }
      else if (typeof lastBall === 'string') {
        if (lastBall.startsWith('W')) { runs = parseInt(lastBall.slice(1)) + 1 || 1; }
        else if (lastBall.startsWith('NB')) { runs = parseInt(lastBall.slice(2)) + 1 || 1; }
        else if (lastBall.startsWith('L')) { runs = parseInt(lastBall.slice(1)) || 0; isValid = true; if (runs % 2 !== 0) { const temp = striker; setStriker(nonStriker); setNonStriker(temp); } }
        else if (lastBall.startsWith('O')) {
          isWicket = true; isValid = true;
          if (batsmanHistory.length > 0) { const prev = batsmanHistory.pop(); setStriker(prev.striker); setNonStriker(prev.nonStriker); setBatsmanHistory([...batsmanHistory]); }
          const lastWicket = wicketOvers.pop(); setWicketOvers([...wicketOvers]); setOutCount(prev => prev - 1);
        }
      }
      setPlayerScore(prev => prev - runs); if (isValid) setValidBalls(prev => Math.max(0, prev - 1));
      if (striker) { await updateBatsmanScore(striker.index, -runs); await updateBatsmanStats(striker.index, -runs, runs === 0); if (isValid) await updateBatsmanBalls(striker.index, -1); }
      if (selectedBowler && (isValid || isWicket)) await updateBowlerStats(selectedBowler.index, isWicket ? -1 : 0, isValid ? -1 : 0, -runs);
    } else {
      const lastBall = currentOverBalls.pop(); setCurrentOverBalls([...currentOverBalls]); setTopPlays(prev => prev.slice(0, -1));
      let runs = 0; let isValid = false; let isWicket = false;
      if (typeof lastBall === 'number') { runs = lastBall; isValid = true; if (runs % 2 !== 0) { const temp = striker; setStriker(nonStriker); setNonStriker(temp); } }
      else if (typeof lastBall === 'string') {
        if (lastBall.startsWith('W')) { runs = parseInt(lastBall.slice(1)) + 1 || 1; }
        else if (lastBall.startsWith('NB')) { runs = parseInt(lastBall.slice(2)) + 1 || 1; }
        else if (lastBall.startsWith('L')) { runs = parseInt(lastBall.slice(1)) || 0; isValid = true; if (runs % 2 !== 0) { const temp = striker; setStriker(nonStriker); setNonStriker(temp); } }
        else if (lastBall.startsWith('O')) {
          isWicket = true; isValid = true;
          if (batsmanHistory.length > 0) { const prev = batsmanHistory.pop(); setStriker(prev.striker); setNonStriker(prev.nonStriker); setBatsmanHistory([...batsmanHistory]); }
          const lastWicket = wicketOvers.pop(); setWicketOvers([...wicketOvers]); setOutCount(prev => prev - 1);
        }
      }
      setPlayerScore(prev => prev - runs); if (isValid) setValidBalls(prev => Math.max(0, prev - 1));
      if (striker) { await updateBatsmanScore(striker.index, -runs); await updateBatsmanStats(striker.index, -runs, runs === 0); if (isValid) await updateBatsmanBalls(striker.index, -1); }
      if (selectedBowler && (isValid || isWicket)) await updateBowlerStats(selectedBowler.index, isWicket ? -1 : 0, isValid ? -1 : 0, -runs);
    }
    setPendingWide(false); setPendingNoBall(false); setPendingLegBy(false); setPendingOut(false); setActiveLabel(null); setActiveNumber(null); setShowRunInfo(false);
  };

  useEffect(() => {
    if (modalContent.title !== 'Match Result') return;
    const canvas = document.getElementById('fireworks-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = canvas.width = canvas.offsetWidth, height = canvas.height = canvas.offsetHeight, fireworks = [];
    function randomColor() { return `hsl(${Math.floor(Math.random() * 360)}, 100%, 70%)`; }
    function createFirework(x, y) { const color = randomColor(), particles = []; for (let i = 0; i < 30; i++) { const angle = (Math.PI * 2 * i) / 30, speed = Math.random() * 1 + 0.5; particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, alpha: 1, color, size: Math.random() * 2 + 0.5 }); } fireworks.push({ particles }); }
    function launch() { createFirework(width / 2, height / 3); createFirework(width / 4, height / 1.8); createFirework((3 * width) / 4, height / 1.8); }
    const interval = setInterval(launch, 1500); update();
    function update() { ctx.clearRect(0, 0, width, height); fireworks.forEach(f => { f.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.alpha -= 0.005; ctx.globalAlpha = p.alpha; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }); f.particles = f.particles.filter(p => p.alpha > 0); }); fireworks = fireworks.filter(f => f.particles.length > 0); ctx.globalAlpha = 1; requestAnimationFrame(update); }
    const resize = () => { width = canvas.width = canvas.offsetWidth; height = canvas.height = canvas.offsetHeight; };
    window.addEventListener('resize', resize);
    return () => { clearInterval(interval); window.removeEventListener('resize', resize); fireworks = []; ctx.clearRect(0, 0, width, height); };
  }, [modalContent.title]);

  useEffect(() => {
    if (gameFinished) { saveMatchData(true); return; }
    if (outCount >= 10 || (validBalls === 6 && overNumber > maxOvers - 1)) {
      if (!isChasing) {
        const overs = `${overNumber - 1}.${validBalls}`;
        const playerStats = battingTeamPlayers.map(player => { const stats = batsmenStats[player.index] || {}; const wicket = wicketOvers.find(w => w.batsmanIndex === player.index); return { index: player.index || '', name: player.name || 'Unknown', photoUrl: player.photoUrl || '', role: player.role || '', runs: stats.runs || 0, balls: stats.balls || 0, dotBalls: stats.dotBalls || 0, ones: stats.ones || 0, twos: stats.twos || 0, threes: stats.threes || 0, fours: stats.fours || 0, sixes: stats.sixes || 0, milestone: stats.milestone || null, wicketOver: wicket ? wicket.over : null, dismissalType: wicket?.dismissalType || null, catchType: wicket?.catchType || null, involvedPlayer: wicket?.involvedPlayer || null }; });
        const bowlerStatsArray = bowlingTeamPlayers.map(player => { const stats = bowlerStats[player.index] || {}; return { index: player.index || '', name: player.name || 'Unknown', photoUrl: player.photoUrl || '', role: player.role || '', wickets: stats.wickets || 0, oversBowled: stats.oversBowled || '0.0', runsConceded: stats.runsConceded || 0 }; });
        setFirstInningsData({ teamName: teamA?.name || 'Team A', totalScore: playerScore, wickets: outCount, overs, playerStats, bowlerStats: bowlerStatsArray });
        setTargetScore(playerScore + 1); setIsChasing(true); resetInnings(); setViewHistory(['start']); saveMatchData();
        displayModal('Innings Break', `You need to chase ${playerScore + 1} runs`);
      } else {
        if (playerScore < targetScore - 1) { displayModal('Match Result', `${teamA.name} wins by ${targetScore - 1 - playerScore} runs!`); setGameFinished(true); }
        else if (playerScore === targetScore - 1) { displayModal('Match Result', 'Match tied!'); setGameFinished(true); }
        else { displayModal('Match Result', `${teamB.name} wins by ${10 - outCount} wickets!`); setGameFinished(true); }
        saveMatchData(true);
      }
      updateMatchesForAllPlayers(selectedPlayersFromProps.left, selectedPlayersFromProps.right, db);
      return;
    }
    if (isChasing && playerScore >= targetScore && targetScore > 0) { displayModal('Match Result', `${teamB.name} wins by ${10 - outCount} wickets!`); setGameFinished(true); saveMatchData(true); return; }
    if (validBalls === 6) {
      setPastOvers(prev => [...prev, currentOverBalls]); setCurrentOverBalls([]); setOverNumber(prev => prev + 1); setValidBalls(0);
      const temp = striker; setStriker(nonStriker); setNonStriker(temp);
      displayModal('Over Finished', `Over ${overNumber} completed!`); setTimeout(() => setShowBowlerDropdown(true), 1000); saveMatchData();
    }
  }, [validBalls, currentOverBalls, nonStriker, overNumber, isChasing, targetScore, playerScore, gameFinished, outCount, maxOvers, teamA, teamB, playedOvers, playedWickets]);

  const resetInnings = () => {
    setCurrentOverBalls([]); setPastOvers([]); setPlayerScore(0); setOutCount(0); setValidBalls(0); setOverNumber(1);
    setStriker(null); setNonStriker(null); setSelectedBowler(null); setSelectedBatsmenIndices([]); setTopPlays([]);
    setBatsmenScores({}); setBatsmenBalls({}); setBatsmenStats({}); setBowlerStats({}); setWicketOvers([]); setGameFinished(false);
    setPendingWide(false); setPendingNoBall(false); setPendingOut(false); setPendingLegBy(false); setPendingRetiredHurt(false);
    setActiveLabel(null); setActiveNumber(null); setShowRunInfo(false); setShowDismissalModal(false);
    setSelectedDismissalType(''); setSelectedCatchType(''); setSelectedInvolvedPlayer(null); setOutRuns(null); setRetiredHurtPlayers([]);
  };

  const getStrikeRate = (batsmanIndex) => {
    const runs = batsmenScores[batsmanIndex] || 0, balls = batsmenBalls[batsmanIndex] || 0;
    return balls === 0 ? 0 : ((runs / balls) * 100).toFixed(2);
  };

  const handlePlayerSelect = (player, type) => {
    if (type === 'striker') { setStriker(player); setNextBatsmanEnd(null); }
    else if (type === 'nonStriker') { setNonStriker(player); setNextBatsmanEnd(null); }
    setSelectedBatsmenIndices(prev => [...prev, player.index]);
    setBatsmenScores(prev => ({ ...prev, [player.index]: 0 })); setBatsmenBalls(prev => ({ ...prev, [player.index]: 0 }));
    setBatsmenStats(prev => ({ ...prev, [player.index]: { runs: 0, balls: 0, dotBalls: 0, ones: 0, twos: 0, threes: 0, fours: 0, sixes: 0, milestone: null } }));
  };

  const handleBowlerSelect = (player) => {
    setSelectedBowler(player);
    setBowlerStats(prev => ({ ...prev, [player.index]: { wickets: prev[player.index]?.wickets || 0, ballsBowled: prev[player.index]?.ballsBowled || 0, oversBowled: prev[player.index]?.oversBowled || '0.0', runsConceded: prev[player.index]?.runsConceded || 0 } }));
    setShowBowlerDropdown(false);
  };

  const handleBatsmanSelect = (player) => {
    if (retiredHurtPlayers.some(p => p.index === player.index)) setRetiredHurtPlayers(prev => prev.filter(p => p.index !== player.index));
    if (nextBatsmanEnd === 'striker') setStriker(player); else setNonStriker(player);
    setSelectedBatsmenIndices(prev => [...prev, player.index]); setShowBatsmanDropdown(false);
    setBatsmenScores(prev => ({ ...prev, [player.index]: 0 })); setBatsmenBalls(prev => ({ ...prev, [player.index]: 0 }));
    setBatsmenStats(prev => ({ ...prev, [player.index]: { runs: 0, balls: 0, dotBalls: 0, ones: 0, twos: 0, threes: 0, fours: 0, sixes: 0, milestone: null } }));
    setNextBatsmanEnd(null);
  };

  const getAvailableBatsmen = () => {
    const notBatted = battingTeamPlayers.filter(p => !selectedBatsmenIndices.includes(p.index));
    const availableRetired = outCount < 9 ? retiredHurtPlayers : [];
    return [...notBatted, ...availableRetired];
  };

  const cancelBatsmanDropdown = () => { setShowBatsmanDropdown(false); setPendingOut(false); setTopPlays(prev => prev.slice(0, -1)); setCurrentOverBalls(prev => prev.slice(0, -1)); setValidBalls(prev => Math.max(0, prev - 1)); setWicketOvers(prev => prev.filter(w => w.batsmanIndex !== striker?.index)); };

  const updateWinnerInFirebase = async (winnerTeamName) => {
    if (!tournamentId || !teamA || !teamB || !matchId || !phase) return;
    try {
      const tournamentRef = doc(db, 'roundrobin', tournamentId);
      const tournamentDoc = await getDoc(tournamentRef);
      if (!tournamentDoc.exists()) return;
      const tournamentData = tournamentDoc.data();
      let matchesToUpdate = [], phaseKey = '', matchIndex = -1;
      if (phase.includes('Group Stage')) {
        const groupNumber = phase.match(/Group Stage (\d+)/)?.[1];
        if (!groupNumber) return;
        phaseKey = `roundRobin.group_stage_${groupNumber}`;
        matchesToUpdate = tournamentData.roundRobin?.[`group_stage_${groupNumber}`] || [];
      } else if (phase.includes('Semi-Final')) { phaseKey = 'semiFinals'; matchesToUpdate = Object.values(tournamentData.semiFinals || {}); }
      else if (phase === 'Final') { phaseKey = 'finals'; matchesToUpdate = Object.values(tournamentData.finals || {}); }
      matchIndex = matchesToUpdate.findIndex(m => m.id === matchId && ((m.team1 === teamA.name && m.team2 === teamB.name) || (m.team1 === teamB.name && m.team2 === teamA.name)));
      if (matchIndex === -1) return;
      if (phase.includes('Group Stage')) {
        const updatedMatches = [...matchesToUpdate]; updatedMatches[matchIndex] = { ...updatedMatches[matchIndex], winner: winnerTeamName === 'Tie' ? 'Tie' : winnerTeamName };
        const groupNumber = phase.match(/Group Stage (\d+)/)?.[1];
        await updateDoc(tournamentRef, { [`roundRobin.group_stage_${groupNumber}`]: updatedMatches });
      } else if (phase.includes('Semi-Final')) { await updateDoc(tournamentRef, { [`semiFinals.match_${matchIndex + 1}.winner`]: winnerTeamName === 'Tie' ? 'Tie' : winnerTeamName }); }
      else if (phase === 'Final') { await updateDoc(tournamentRef, { [`finals.match_${matchIndex + 1}.winner`]: winnerTeamName === 'Tie' ? 'Tie' : winnerTeamName }); }
      if (winnerTeamName !== 'Tie') {
        const teams = tournamentData.teams || [];
        const teamIndex = teams.findIndex(t => t.teamName === winnerTeamName);
        if (teamIndex !== -1) {
          const updatedTeams = [...teams]; updatedTeams[teamIndex] = { ...updatedTeams[teamIndex], points: (updatedTeams[teamIndex].points || 0) + 2 };
          await updateDoc(tournamentRef, { teams: updatedTeams });
        }
      }
    } catch (err) { console.error('Error updating winner:', err); }
  };

  async function updatePointsTable(tournamentId, teamA, teamB, winnerTeamName, isTie, firstInnings, secondInnings, maxOvers) {
    try {
      const pointsTableRef = doc(db, 'PointsTable', tournamentId);
      const pointsTableDoc = await getDoc(pointsTableRef);
      let teams = [];
      if (pointsTableDoc.exists()) teams = pointsTableDoc.data().teams || [];
      else await setDoc(pointsTableRef, { tournamentId, teams: [] });
      const getTeamIndex = (teamName) => teams.findIndex(t => t.teamName === teamName);
      const updateTeamStats = (teamName, isWin, isLoss, isDraw, runsScored, oversFaced, runsConceded, oversBowled) => {
        const index = getTeamIndex(teamName);
        if (index === -1) { teams.push({ teamName, matches: 1, wins: isWin ? 1 : 0, losses: isLoss ? 1 : 0, draws: isDraw ? 1 : 0, points: isWin ? 2 : (isDraw ? 1 : 0), runsScored, oversFaced, runsConceded, oversBowled, nrr: ((runsScored / oversFaced) - (runsConceded / oversBowled)).toFixed(3) || 0 }); }
        else { const u = { ...teams[index] }; u.matches += 1; if (isWin) u.wins += 1; if (isLoss) u.losses += 1; if (isDraw) u.draws += 1; u.points += isWin ? 2 : (isDraw ? 1 : 0); u.runsScored += runsScored; u.oversFaced += oversFaced; u.runsConceded += runsConceded; u.oversBowled += oversBowled; u.nrr = ((u.runsScored / u.oversFaced) - (u.runsConceded / u.oversBowled)).toFixed(3) || 0; teams[index] = u; }
      };
      const battingFirstTeam = firstInnings.teamName;
      const teamARuns = (battingFirstTeam === teamA.name) ? firstInnings.totalScore : (secondInnings ? secondInnings.totalScore : 0);
      const teamAOversFaced = (battingFirstTeam === teamA.name) ? (firstInnings.wickets === 10 ? firstInnings.overs : maxOvers) : (secondInnings ? (secondInnings.wickets === 10 ? secondInnings.overs : maxOvers) : 0);
      const teamBRuns = (battingFirstTeam === teamB.name) ? firstInnings.totalScore : (secondInnings ? secondInnings.totalScore : 0);
      const teamBOversFaced = (battingFirstTeam === teamB.name) ? (firstInnings.wickets === 10 ? firstInnings.overs : maxOvers) : (secondInnings ? (secondInnings.wickets === 10 ? secondInnings.overs : maxOvers) : 0);
      updateTeamStats(teamA.name, winnerTeamName === teamA.name, winnerTeamName === teamB.name, isTie, teamARuns, teamAOversFaced, teamBRuns, teamBOversFaced);
      updateTeamStats(teamB.name, winnerTeamName === teamB.name, winnerTeamName === teamA.name, isTie, teamBRuns, teamBOversFaced, teamARuns, teamAOversFaced);
      await updateDoc(pointsTableRef, { teams });
    } catch (error) { console.error('Error updating PointsTable:', error); }
  }

  async function updateMatchWinnerInSchedule(tournamentId, matchId, winnerTeamName) {
    const docRef = doc(db, "roundrobin", tournamentId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    const matchSchedule = data.matchSchedule || [];
    const idx = matchSchedule.findIndex(ms => ms.matchId === matchId);
    if (idx === -1) return;
    matchSchedule[idx].winner = winnerTeamName;
    await updateDoc(docRef, { matchSchedule });
  }

  const handleModalOkClick = () => {
    setShowModal(false);
    if (gameFinished && modalContent.title === 'Match Result') {
      let winnerTeamName = '', isTie = false, winningDifference = '';
      const tA = teamA || displayTeamA; const tB = teamB || displayTeamB;
      if (playerScore < targetScore - 1) { winnerTeamName = tA.name; winningDifference = `${targetScore - 1 - playerScore} runs`; }
      else if (playerScore === targetScore - 1) { winnerTeamName = 'Tie'; isTie = true; winningDifference = 'Tie'; }
      else { winnerTeamName = tB.name; winningDifference = `${10 - outCount} wickets`; }
      updateWinnerInFirebase(winnerTeamName);
      updateMatchWinnerInSchedule(tournamentId, matchId, winnerTeamName);
      updatePointsTable(tournamentId, tA, tB, winnerTeamName, isTie, firstInningsData, isChasing ? { teamName: currentBattingTeam.name, totalScore: playerScore, wickets: outCount, overs: overNumber - 1 + (validBalls / 6) } : null, maxOvers);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem('currentMatchKey');
      localStorage.removeItem('tournamentId');
      localStorage.removeItem('matchId');
      if (originPage) {
        navigate(originPage, { state: { activeTab: 'Match Results', winner: winnerTeamName, winningDifference, tournamentId, tournamentName, information, teamA: { name: tA.name, flagUrl: tA.flagUrl, score: isChasing ? targetScore - 1 : playerScore, wickets: isChasing ? playedWickets : outCount, balls: isChasing ? playedOvers : (overNumber - 1) * 6 + validBalls }, teamB: { name: tB.name, flagUrl: tB.flagUrl, score: isChasing ? playerScore : targetScore - 1, wickets: isChasing ? outCount : 0, balls: isChasing ? (overNumber - 1) * 6 + validBalls : 0 } } });
      } else { navigate('/'); }
    } else if (modalContent.title === 'Innings Break') { resetInnings(); setIsChasing(true); setCurrentView('start'); setShowThirdButtonOnly(false); setViewHistory(['start']); }
  };

  // ── Helper render functions ────────────────────────────────────────────
  const getPlayerImage = (player, sizeClass = 'w-16 h-16') => {
    if (player?.photoUrl) return <img src={player.photoUrl} alt={player.name} className={`${sizeClass} rounded-full object-cover aspect-square border-[3px] border-[#F0167C]`} onError={(e) => { e.target.onerror = null; e.target.src = ''; }} />;
    return <div className={`${sizeClass} flex items-center justify-center bg-blue-500 text-white font-bold rounded-full border-[3px] border-[#F0167C] text-lg`}>{player?.name?.charAt(0).toUpperCase() || '?'}</div>;
  };

  const getTeamAvatar = (team) => {
    if (team?.flagUrl) return <img src={team.flagUrl} alt={team.name} className="w-16 h-16 aspect-square object-cover rounded-sm" onError={(e) => e.target.src = ''} />;
    return <div className="w-16 h-16 flex items-center justify-center bg-blue-500 text-white font-bold rounded-sm text-2xl">{team?.name?.charAt(0).toUpperCase() || '?'}</div>;
  };

  // ── Show loading screen until restore is done ─────────────────────────
  if (!isRestored) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white"
        style={{ backgroundImage: 'linear-gradient(140deg,#08000F 15%,#FF0077)', backgroundSize: 'cover' }}>
        <div className="text-center">
          <div className="text-2xl font-bold mb-2">Restoring Match...</div>
          <div className="text-gray-300 text-sm">Please wait</div>
        </div>
      </div>
    );
  }

  if (!currentView && !showThirdButtonOnly) return <div className="text-white text-center p-4"><h1>Loading...</h1></div>;
  if ((!teamA || !teamB) && !currentBattingTeam) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center"><p className="text-xl">Loading team data...</p></div>;
  const displayTeamA = teamA || { name: currentBattingTeam?.name || 'Team A', flagUrl: currentBattingTeam?.flagUrl || '' };
  const displayTeamB = teamB || { name: currentBowlingTeam?.name || 'Team B', flagUrl: currentBowlingTeam?.flagUrl || '' };

  // ── RENDER ─────────────────────────────────────────────────────────────
  return (
    <ErrorBoundary>
      <section
        className="w-full flex flex-col items-center"
        style={{ backgroundImage: 'linear-gradient(140deg,#08000F 15%,#FF0077)', backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundPosition: 'center', minHeight: '100vh', overflow: 'hidden' }}
      >
        {HeaderComponent ? <HeaderComponent /> : <div className="text-white">Header Missing</div>}

        {/* Animation overlay */}
        {showAnimation && (
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
            <div className="w-full h-full flex items-center justify-center">
              {animationType === 'six' && <Player autoplay loop src={sixAnimation} style={{ width: '500px', height: '500px' }} />}
              {animationType === 'four' && <Player autoplay loop src={fourAnimation} style={{ width: '500px', height: '500px' }} />}
              {animationType === 'out' && <Player autoplay loop src={outAnimation} style={{ width: '500px', height: '500px' }} />}
            </div>
          </div>
        )}

        {/* Back button */}
        <button onClick={goBack} className="absolute left-4 top-24 md:left-10 md:top-32 z-10 w-10 h-10 flex items-center justify-center">
          <img alt="Back" className="w-6 h-6 transform rotate-180 mb-5" src={backButton} onError={(e) => (e.target.src = '')} />
        </button>

        {/* ── Main Modal ── */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#4C0025] p-6 rounded-lg max-w-md w-full relative">
              {modalContent.title === 'Match Result' && <canvas id="fireworks-canvas" className="absolute inset-0 w-full h-full z-0" />}
              {modalContent.title === 'Match Result' && <DotLottieReact src="https://lottie.host/42c7d544-9ec0-4aaf-895f-3471daa49e49/a5beFhswU6.lottie" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }} loop autoplay />}
              <h3 className="text-white text-xl font-bold mb-4 relative z-10">{modalContent.title}</h3>
              <p className="text-white mb-6 relative z-10">{modalContent.message}</p>
              <div className="flex justify-center relative z-10">
                <button onClick={handleModalOkClick} className="w-40 h-12 bg-[#FF62A1] text-white font-bold text-lg rounded-lg border-2 border-white">OK</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Dismissal Modal ── */}
        {showDismissalModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#4C0025] p-4 md:p-6 rounded-lg max-w-md w-full mx-4 relative">
              <button onClick={() => { setShowDismissalModal(false); setSelectedDismissalType(''); setSelectedCatchType(''); setSelectedInvolvedPlayer(null); setOutRuns(null); setPendingOut(false); }} className="absolute top-2 right-2 w-6 h-6 text-white font-bold flex items-center justify-center text-xl">×</button>
              <h3 className="text-white text-lg md:text-xl font-bold mb-4">Select Dismissal Details</h3>
              <div className="mb-4">
                <label className="text-white block mb-2">Dismissal Type</label>
                <select value={selectedDismissalType} onChange={(e) => setSelectedDismissalType(e.target.value)} className="w-full p-2 rounded bg-gray-700 text-white">
                  <option value="">Select Dismissal Type</option>
                  {dismissalTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {selectedDismissalType === 'Run Out' && (
                <div className="mb-4">
                  <label className="text-white block mb-2">Which batsman is out?</label>
                  <select value={outBatsmanType} onChange={(e) => setOutBatsmanType(e.target.value)} className="w-full p-2 rounded bg-gray-700 text-white">
                    <option value="">Select Batsman</option>
                    <option value="striker">{striker?.name} (Striker)</option>
                    <option value="non-striker">{nonStriker?.name} (Non-Striker)</option>
                  </select>
                </div>
              )}
              {['Caught', 'Caught Behind'].includes(selectedDismissalType) && (
                <div className="mb-4">
                  <label className="text-white block mb-2">Catch Type</label>
                  <select value={selectedCatchType} onChange={(e) => setSelectedCatchType(e.target.value)} className="w-full p-2 rounded bg-gray-700 text-white">
                    <option value="">Select Catch Type</option>
                    {catchTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              {selectedDismissalType && !['Bowled', 'LBW', 'Caught & Bowled'].includes(selectedDismissalType) && (
                <div className="mb-4">
                  <label className="text-white block mb-2">{selectedDismissalType === 'Stumped' ? 'Wicketkeeper' : 'Fielder'}</label>
                  <select value={selectedInvolvedPlayer?.index || ''} onChange={(e) => setSelectedInvolvedPlayer(bowlingTeamPlayers.find(p => p.index === e.target.value))} className="w-full p-2 rounded bg-gray-700 text-white">
                    <option value="">Select Player</option>
                    {bowlingTeamPlayers.map(p => <option key={p.index} value={p.index}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex justify-center">
                <button onClick={handleDismissalModalSubmit}
                  disabled={!selectedDismissalType || (['Caught', 'Caught Behind'].includes(selectedDismissalType) && (!selectedCatchType || !selectedInvolvedPlayer)) || (['Run Out', 'Stumped'].includes(selectedDismissalType) && !selectedInvolvedPlayer)}
                  className={`w-40 h-12 text-white font-bold text-lg rounded-lg border-2 border-white ${selectedDismissalType ? 'bg-[#FF62A1] hover:bg-[#FF62A1]/80' : 'bg-gray-500 cursor-not-allowed'}`}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Leg By Modal ── */}
        {showLegByModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#4C0025] p-4 md:p-6 rounded-lg max-w-md w-full mx-4 relative">
              <button onClick={() => setShowLegByModal(false)} className="absolute top-2 right-2 w-6 h-6 text-white font-bold flex items-center justify-center text-xl">×</button>
              <h3 className="text-white text-lg font-bold mb-4">Leg By — which batsman?</h3>
              <select value={legByBatsmanType} onChange={(e) => setLegByBatsmanType(e.target.value)} className="w-full p-2 rounded bg-gray-700 text-white mb-4">
                <option value="">Select Batsman</option>
                <option value="striker">{striker?.name} (Striker)</option>
                <option value="non-striker">{nonStriker?.name} (Non-Striker)</option>
              </select>
              <div className="flex justify-center">
                <button onClick={handleLegByModalSubmit} disabled={!legByBatsmanType} className={`w-40 h-12 text-white font-bold rounded-lg border-2 border-white ${legByBatsmanType ? 'bg-[#FF62A1]' : 'bg-gray-500 cursor-not-allowed'}`}>Confirm</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Retired Hurt Modal ── */}
        {showRetiredHurtModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#4C0025] p-4 md:p-6 rounded-lg max-w-md w-full mx-4 relative">
              <button onClick={() => setShowRetiredHurtModal(false)} className="absolute top-2 right-2 w-6 h-6 text-white font-bold flex items-center justify-center text-xl">×</button>
              <h3 className="text-white text-lg font-bold mb-4">Retired Hurt — which batsman?</h3>
              <select value={retiredHurtBatsmanType} onChange={(e) => setRetiredHurtBatsmanType(e.target.value)} className="w-full p-2 rounded bg-gray-700 text-white mb-4">
                <option value="">Select Batsman</option>
                <option value="striker">{striker?.name} (Striker)</option>
                <option value="non-striker">{nonStriker?.name} (Non-Striker)</option>
              </select>
              <div className="flex justify-center">
                <button onClick={handleRetiredHurtModalSubmit} disabled={!retiredHurtBatsmanType} className={`w-40 h-12 text-white font-bold rounded-lg border-2 border-white ${retiredHurtBatsmanType ? 'bg-[#FF62A1]' : 'bg-gray-500 cursor-not-allowed'}`}>Confirm</button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ SCORE BOARD ══════════════ */}
        <div id="start" className="relative flex flex-col w-full h-full items-center px-4 mt-20 md:mt-10">
          <h2 className="text-4xl md:text-3xl lg:text-5xl text-white font-bold text-center">Score Board</h2>

          {/* ── Top-right: Show/Hide Overs button + panel ── */}
          <div className="absolute right-0 md:right-4 lg:right-8 xl:right-12 2xl:right-20 top-0 md:top-4">
            <button
              onClick={() => setShowPastOvers(v => !v)}
              className="w-24 md:w-32 h-10 md:h-12 bg-[#4C0025] text-white font-bold text-sm md:text-lg rounded-lg border-2 border-white"
            >
              {showPastOvers ? 'Hide Overs' : 'Show Overs'}
            </button>

            {showPastOvers && (
              <div className="mt-2 md:mt-4 text-white w-48 md:w-64 absolute right-0">
                <h3 className="text-lg md:text-xl font-bold mb-2 md:mb-4 text-center">Overs History</h3>
                <div className="bg-[#4C0025] p-3 rounded-lg w-full max-h-48 md:max-h-64 overflow-y-auto">
                  {[...pastOvers, currentOverBalls.length > 0 ? currentOverBalls : null]
                    .filter(Boolean).reverse()
                    .map((over, index) => (
                      <div key={index} className="mb-3">
                        <div className="text-sm md:text-base font-bold text-yellow-300">
                          Over {pastOvers.length - index}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {over.map((ball, ballIndex) => {
                            let displayBall = ball;
                            if (typeof ball === 'string' && ball.includes('+')) {
                              const [type, rest] = ball.split('+');
                              if (type.toLowerCase() === 'wd') displayBall = `Wd+${rest}`;
                              else if (type.toLowerCase() === 'nb') displayBall = `Nb+${rest}`;
                              else if (type.toLowerCase() === 'w') displayBall = `W+${rest}`;
                              else if (type.toLowerCase() === 'o') displayBall = `W+${rest}`;
                              else displayBall = `${type}+${rest}`;
                            }
                            const isWicket = typeof ball === 'string' && (ball.toLowerCase().startsWith('o') || ball.toLowerCase().includes('w+'));
                            return (
                              <div key={`ball-${ballIndex}`} title={String(displayBall)}
                                className={`min-w-[1.4rem] h-6 flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold truncate max-w-[3.5rem] text-white
                                  ${isWicket ? 'bg-red-600' : 'bg-[#FF62A1]'}`}>
                                {displayBall}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Teams + Score row */}
          <div className="mt-4 flex flex-col md:flex-row w-full md:w-1/2 justify-around gap-20 h-fit pt-2">
            <div className="flex items-center justify-center mb-4 md:mb-0">
              {getTeamAvatar(currentBattingTeam)}
              <div className="ml-4 md:ml-10">
                <h3 className="text-sm md:text-2xl lg:text-4xl text-white font-bold text-center">
                  {playerScore} - {outCount}
                  <div className="text-base md:text-lg lg:text-xl">{overNumber > maxOvers ? maxOvers : overNumber - 1}.{validBalls}/{maxOvers}</div>
                </h3>
              </div>
            </div>
            <div className="flex items-center justify-center mb-4 md:mb-0">
              <div className="mr-4 md:mr-10">
                <h3 className="text-lg md:text-2xl lg:text-4xl text-white font-bold text-center text-yellow-300 underline">
                  {isChasing ? `Target: ${targetScore}` : 'Not yet'}
                </h3>
              </div>
              {getTeamAvatar(currentBowlingTeam)}
            </div>
          </div>

          {/* Striker / Non-Striker / Bowler */}
          <div className="mt-2 flex flex-col md:flex-row w-full md:w-[45%] justify-between relative">
            <div className="flex flex-row px-[4.8%] md:p-0 justify-between md:flex-row md:items-center gap-4 md:gap-8 mb-4 md:mb-0">
              {/* Striker */}
              <div className="text-white text-center">
                <h3 className={`text-lg md:text-xl font-bold ${striker ? 'text-yellow-300' : 'text-gray-400'}`}>Striker</h3>
                {striker ? (
                  <div className="flex flex-col items-center">
                    {getPlayerImage(striker, 'w-12 h-12')}
                    <div className="font-bold text-sm mt-1">{striker.name}</div>
                    <div className="text-xs">{striker.role}</div>
                    <div className="text-xs">{batsmenScores[striker.index] || 0} ({batsmenBalls[striker.index] || 0}) <span className="text-yellow-300">SR: {getStrikeRate(striker.index)}</span></div>
                  </div>
                ) : (
                  <select onChange={(e) => { const p = battingTeamPlayers.find(pl => pl.index === e.target.value); handlePlayerSelect(p, 'striker'); }} className="w-36 p-2 rounded bg-gray-700 text-white text-sm">
                    <option value="">Select Striker</option>
                    {getAvailableBatsmen().map(p => <option key={p.index} value={p.index}>{p.name}</option>)}
                  </select>
                )}
              </div>

              {/* Non-Striker */}
              <div className="hidden sm:block text-white text-center">
                <h3 className={`text-lg md:text-xl font-bold ${!striker ? 'text-yellow-300' : 'text-gray-400'}`}>Non-Striker</h3>
                {nonStriker ? (
                  <div className="flex flex-col items-center">
                    {getPlayerImage(nonStriker, 'w-12 h-12')}
                    <div className="font-bold text-sm mt-1">{nonStriker.name}</div>
                    <div className="text-xs">{nonStriker.role}</div>
                    <div className="text-xs">{batsmenScores[nonStriker.index] || 0} ({batsmenBalls[nonStriker.index] || 0}) <span className="text-yellow-300">SR: {getStrikeRate(nonStriker.index)}</span></div>
                  </div>
                ) : (
                  <select onChange={(e) => { const p = battingTeamPlayers.find(pl => pl.index === e.target.value); handlePlayerSelect(p, 'nonStriker'); }} className="w-36 p-2 rounded bg-gray-700 text-white text-sm">
                    <option value="">Select Non-Striker</option>
                    {getAvailableBatsmen().map(p => <option key={p.index} value={p.index}>{p.name}</option>)}
                  </select>
                )}
              </div>
            </div>

            {/* Bowler */}
            <div className="hidden sm:block w-20 text-white text-center">
              <h3 className="text-lg md:text-xl font-bold">Bowler</h3>
              {selectedBowler ? (
                <div className="flex flex-col items-center">
                  {getPlayerImage(selectedBowler, 'w-12 h-12')}
                  <div className="font-bold text-sm mt-1">{selectedBowler.name}</div>
                  <div className="text-xs">{selectedBowler.role}</div>
                  {bowlerStats[selectedBowler.index] && (
                    <div className="text-xs">{bowlerStats[selectedBowler.index].oversBowled} - {bowlerStats[selectedBowler.index].runsConceded} - {bowlerStats[selectedBowler.index].wickets}</div>
                  )}
                </div>
              ) : (
                <select onChange={(e) => { const p = bowlingTeamPlayers.find(pl => pl.index === e.target.value); handleBowlerSelect(p); }} className="w-36 p-2 rounded bg-gray-700 text-white text-sm">
                  <option value="">Select Bowler</option>
                  {bowlingTeamPlayers.map(p => <option key={p.index} value={p.index}>{p.name}</option>)}
                </select>
              )}
            </div>

          </div>

          {/* ── Run buttons ── */}
          <div className="mt-4 flex flex-wrap justify-center gap-2 md:gap-4 items-center">
            <button
              onClick={handleUndoBall}
              disabled={currentOverBalls.length === 0 && pastOvers.length === 0}
              title="Undo last ball"
              className={`w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full border-2 border-white flex items-center justify-center font-bold text-xl transition-colors duration-300
                ${(currentOverBalls.length === 0 && pastOvers.length === 0)
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-40'
                  : 'bg-red-700 hover:bg-red-500 text-white'}`}
            >
              ↩
            </button>

            {[0, 1, 2, 3, 4, 5, 6].map((num) => {
              const isActive = activeNumber === num;
              const isDisabled = isButtonFrozen || !striker || !nonStriker || !selectedBowler || (pendingOut && num > 2);
              return (
                <button key={num} onClick={() => handleScoreButtonClick(num, false)} disabled={isDisabled}
                  className={`w-12 h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-full border-2 border-white font-bold text-lg md:text-xl text-white transition-colors duration-300
                    ${isActive ? 'bg-green-500' : 'bg-[#4C0025] hover:bg-green-600'}
                    ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {num}
                </button>
              );
            })}
          </div>

          {/* ── Extra labels ── */}
          <div className="mt-2 flex flex-wrap justify-center gap-2 md:gap-4">
            {['Wide', 'No-ball', 'OUT', 'Leg By', 'Retired Hurt'].map((label) => {
              const isActive = activeLabel === label;
              const isDisabled = !striker || !nonStriker || !selectedBowler;
              return (
                <button key={label} onClick={() => handleScoreButtonClick(label, true)} disabled={isDisabled}
                  className={`w-20 h-10 md:w-24 md:h-12 rounded-lg border-2 border-white font-bold text-sm md:text-base text-white transition-colors duration-300
                    ${isActive ? 'bg-red-600' : 'bg-[#4C0025] hover:bg-red-400'}
                    ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {label}
                </button>
              );
            })}
          </div>

          {/* AI companion */}
          <div>
            {isAICompanionOpen && (
              <AIMatchCompanionModal isOpen={isAICompanionOpen} predictionData={predictionData} tournamentId={tournamentId} maxOvers={maxOvers} battingBalls={(overNumber - 1) * 6 + validBalls} />
            )}
          </div>

          {/* Status messages */}
          {showRunInfo && (
            <p className="text-yellow-400 text-sm mt-2 text-center font-medium">
              {pendingOut ? 'Please select 0, 1, or 2 for runs on out' : 'Please select run, if not select 0'}
            </p>
          )}
          {showHurryMessage && (
            <p className="text-orange-400 text-sm mt-1 text-center font-medium">Please wait before scoring the next ball</p>
          )}

          {/* Next Batsman dropdown */}
          {showBatsmanDropdown && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-[#4C0025] p-4 md:p-6 rounded-lg max-w-md w-full mx-4 relative">
                <button onClick={cancelBatsmanDropdown} className="absolute top-2 right-2 w-6 h-6 text-white font-bold flex items-center justify-center text-xl">×</button>
                <h3 className="text-white text-lg md:text-xl font-bold mb-4">Select Next Batsman</h3>
                <div className="grid grid-cols-2 gap-2 md:gap-4">
                  {getAvailableBatsmen().map((player) => (
                    <div key={player.index} onClick={() => handleBatsmanSelect(player)} className="cursor-pointer flex flex-col items-center text-white text-center p-2 hover:bg-[#FF62A1] rounded-lg">
                      {player.photoUrl ? <img src={player.photoUrl} alt="Player" className="w-12 h-12 md:w-16 md:h-16 rounded-full object-cover aspect-square" onError={(e) => (e.target.src = '')} />
                        : <div className="w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center bg-gray-500 text-white text-xl font-bold">{player.name.charAt(0).toUpperCase()}</div>}
                      <span className="text-xs md:text-sm mt-1">{player.name}</span>
                      <span className="text-xs">{player.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Next Bowler dropdown */}
          {showBowlerDropdown && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-[#4C0025] p-4 md:p-6 rounded-lg max-w-md w-full mx-4 relative">
                <button onClick={() => setShowBowlerDropdown(false)} className="absolute top-2 right-2 w-6 h-6 text-white font-bold flex items-center justify-center text-xl">×</button>
                <h3 className="text-white text-lg md:text-xl font-bold mb-4">Select Next Bowler</h3>
                <div className="grid grid-cols-2 gap-2 md:gap-4">
                  {bowlingTeamPlayers.filter(p => p.index !== selectedBowler?.index).map((player) => (
                    <div key={player.index} onClick={() => handleBowlerSelect(player)} className="cursor-pointer flex flex-col items-center text-white text-center p-2 hover:bg-[#FF62A1] rounded-lg">
                      {player.photoUrl ? <img src={player.photoUrl} alt="Player" className="w-12 h-12 md:w-16 md:h-16 rounded-full object-cover aspect-square" onError={(e) => (e.target.src = '')} />
                        : <div className="w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center bg-gray-500 text-white text-xl font-bold">{player.name.charAt(0).toUpperCase()}</div>}
                      <span className="text-xs md:text-sm mt-1">{player.name}</span>
                      <span className="text-xs">{player.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wagon Wheel */}
        {showMainWheel && (
          <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center overflow-y-auto">
            <div className="my-2 bg-white rounded-xl w-[95%] max-w-4xl mx-auto flex flex-col items-center shadow-lg h-[95vh]">
              <MainWheel run={selectedRun} player={striker} setShowMainWheel={setShowMainWheel} tournamentId={tournamentId} currentOver={overNumber} wickets={outCount} totalRuns={playerScore} />
              <button onClick={() => setShowMainWheel(false)} className="mt-5 bg-black text-white px-6 py-2 rounded-lg hover:bg-gray-800 transition">Continue</button>
            </div>
          </div>
        )}
      </section>
    </ErrorBoundary>
  );
}

export default StartMatchPlayersRoundRobin;
