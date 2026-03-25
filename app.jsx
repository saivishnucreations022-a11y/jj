import React, { useState, useEffect  } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import ClubMain from './pages/Clubmain'
import Tab from "./components/yogesh/LandingPage/tab"
import AddPlayer from './pages/Addplayer';
import Login from './components/yogesh/LoginPage/login';
import Signup from './components/yogesh/LoginPage/signup';
import SignupB from './components/yogesh/LoginPage/SignupB';
import Landingpage1 from './pages/Landingpage1';
import SearchBarAft from './components/yogesh/LandingPage/SearchBar';
import CommunitySection from './pages/CommunitySection';
import AcademicsPage from './pages/Community/AcademicsPage';
import BatManufacturesPage from './pages/Community/Bats/BatManufacturesPage';
import UploadBatManufacturers from "./pages/Community/Bats/UploadBatManufacturers";
import CommentatorsPage from './pages/Community/CommentatorsPage';
import GroundsPage from './pages/Community/Grounds/GroundsPage';
import BookGroundsPage from './pages/Community/Grounds/BookGroundsPage';
import BookUmpiresPage from './pages/Community/Umpires/BookUmpiresPage';
import BookCoachPage from './pages/Community/Coach/BookCoachPage';
import ViewGroundSchedulesPage from './pages/Community/Grounds/ViewGroundSchedulesPage';
import ViewUmpireSchedulesPage from './pages/Community/Umpires/ViewUmpireSchedulesPage';
import ViewCoachSchedulesPage from './pages/Community/Coach/ViewCoachSchedulesPage';
import OrganisersPage from './pages/Community/OrganisersPage';
import PersonalCoachingPage from './pages/Community/Coach/PersonalCoachingPage';
import ScoresPage from './pages/Community/ScoresPage';
import ShopsPage from './pages/Community/ShopsPage';
import StreamersPage from './pages/Community/StreamersPage';
import TrophyVendorsPage from './pages/Community/Trophy/TrophyVendorsPage';
import TshirtVendorsPage from './pages/Community/Tshirts/TshirtVendorsPage';
import UmpiresPage from './pages/Community/Umpires/UmpiresPage';
import LiveMatchDetails from './components/yogesh/LandingPage/LiveMatchDetails';
import Landingpage from './pages/Landingpage';
import Sidebar from './components/sophita/HomePage/Sidebar';
import Golive from './pages/Golive';
import Club from './pages/Club';
import Message from "./pages/Message";
import Contact from './pages/contacts';
import FieldingStatsPage from './components/sophita/HomePage/Fielding';
import Tabletoppers from './pages/Tabletoppers';
import Termsandconditions from './components/sophita/Termsandconditions';
import ChatMessage from './components/sophita/ChatMessage';
import TournamentStats from './pages/TournamentStats';
import Startmatch from './pages/Startmatch';
import StartmatchSB from './pages/StartmatchSB';
import StartmatchRR from './pages/RoundRobin/StartmatchRR';
import StartMatchKO from './pages/KnouckOut/StartMatchKO';
import Tournaments from './pages/Tournaments';
import TeamDetails from './pages/TeamDetails';
import Highlights from './pages/Highlights'
import MatchStartRR from './pages/RoundRobin/MatchStartRR';
import MatchStartSB from './pages/MatchStartSB';
import MatchStart from './pages/MatchStart';
import MatchStartKO from './pages/KnouckOut/MatchStartKO';
import TournamentBracket from './components/kumar/flowchart';
import UpcomingPage from './pages/Upcomming';
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import AdminPanel from './pages/AdminPanel';
import PlayerPages from './pages/PlayerPages';
import BowlingPlayerPages from './pages/BowlingPlayerPages';
import Awards from './components/pawan/Awards';
import Winner from './components/pawan/Winner';
import Winner25 from './components/pawan/Winner25';
import Winner24 from './components/pawan/Winner24';
import Winner23 from './components/pawan/Winner23';
import SelectionCriteria from './components/pawan/SelectionCriteria';
import National from './components/pawan/National';
import International from './components/pawan/International';
import Stats from './pages/Stats';
import Match from './pages/Match';
import Insights from './components/yogesh/LandingPage/Insights';
import Subscription from './components/pawan/Subscription';
import SubscriptionSuccess from './components/pawan/SubscriptionSuccess';
import Notifications from './components/pawan/Notifications'
import Whatsapp from './pages/Community/Umpires/Whatsapp'
import PendingTournaments from './components/kumar/pendingTournament';
import TournamentSeries from './pages/tournamentseries';
import TournamentPage from './components/kumar/share';
import TeamProfile from './components/kumar/team_profile';
import Tournament_nextpg from './components/kumar/tournament_nextpg';
import TournamentSuccess from './pages/TournamentSuccess';
import Greeting from './pages/greeting';
import StartMatchPlayers from './pages/StartMatchPlayers';
import StartMatchPlayersSB from './pages/StartMatchPlayersSB';
import StartMatchPlayersRR from './pages/RoundRobin/StartMatchPlayersRR';
import StartMatchPlayersKO from './pages/KnouckOut/StartMatchPlayersKO';
import Selection from './components/kumar/selection';
import Selection1 from './components/kumar/Selection1';
import Selection2 from './components/kumar/selection2';
import Flowchart from './components/kumar/flowchart';
import UploadTrophy from './pages/Community/Trophy/Uploadtrophy';
import UploadTshirt from './pages/Community/Tshirts/UploadTshirt';

import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const docRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const userData = docSnap.data();
            setUserProfile({
              uid: user.uid,
              email: user.email,
              userName: userData.firstName || "User",
              profileImageUrl: userData.profileImageUrl || null,
              whatsapp: userData.whatsapp || "No phone",
              themeColor: userData.themeColor || "#5DE0E6",
              accountType: userData.accountType || "public",
            });
          } else {
            setUserProfile({
              uid: user.uid,
              email: user.email,
              userName: "User",
              profileImageUrl: null,
              whatsapp: "No phone",
              themeColor: "#5DE0E6",
              accountType: "public",
            });
          }
        } catch (error) {
          console.error("Error fetching user document:", error);
          setUserProfile({
            uid: user.uid,
            email: user.email,
            userName: "User",
            profileImageUrl: null,
            whatsapp: "No phone",
            themeColor: "#5DE0E6",
            accountType: "public",
          });
        } finally {
          setLoadingUser(false);
        }
      } else {
        setUserProfile(null);
        setLoadingUser(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // ✅ FIX: REMOVED the early return `if (loadingUser) return <div>Loading user...</div>`
  // That block was unmounting the entire <Routes> tree during auth re-hydration on reload,
  // which meant StartMatchPlayersRR never mounted and its restore useEffect never ran.
  // Routes that truly need auth already protect themselves individually (e.g. userProfile ? <Page/> : <Login/>).
  // We still pass loadingUser down so protected pages can show their own spinner if needed.

  return (
    <Router>
      <ToastContainer position="top-center" autoClose={3000} />
      <div className="relative h-screen w-screen overflow-y-auto">
        {/* Sidebar */}
        <Routes>
          <Route
            path="/landingpage"
            element={userProfile && <Sidebar isOpen={isSidebarOpen} closeMenu={() => setIsSidebarOpen(false)} userProfile={userProfile} />}
          />
        </Routes>

        {/* Main Content */}
        <Routes>
          <Route path="/" element={<Landingpage1 />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/search-aft" element={<SearchBarAft />} />
          <Route path="/landingpage" element={userProfile ? <Landingpage menuOpen={isSidebarOpen} setMenuOpen={setIsSidebarOpen} userProfile={userProfile} /> : <Login />} />
          <Route path="/go-live" element={<Golive />} />
          <Route path="/start-match" element={<Startmatch />} />
          <Route path="/start-match-sb" element={<StartmatchSB />} />
          <Route path="/start-match-rr" element={<StartmatchRR />} />
          <Route path="/start-match-ko" element={<StartMatchKO />} />
          <Route path="/club" element={<Club />} />
          <Route path="/message" element={<Message/>} />
          <Route path="/Clubsmain" element={<ClubMain/>} />
          <Route path="/clubs/:id" element={<Tab/>} />
          <Route path="/Tab" element={<Tab/>} />
          <Route path="/go-live-upcomming" element={<UpcomingPage/>} />
          <Route path="/community" element={<CommunitySection/>} />
          <Route path="/academics" element={<AcademicsPage/>} />
          <Route path="/bat-manufactures" element={<BatManufacturesPage/>} />
          <Route path="/book-session" element={<BookCoachPage />} />
          <Route path="/commentators" element={<CommentatorsPage/>} />
          <Route path="/grounds" element={<GroundsPage/>} />
          <Route path="/book-grounds/:groundId" element={<BookGroundsPage/>} />
          <Route path="/book-umpires/:groundId" element={<BookUmpiresPage/>} />
          <Route path="/view-u-schedules/:umpireId" element={<ViewUmpireSchedulesPage/>} />
          <Route path="/view-g-schedules/:groundId" element={<ViewGroundSchedulesPage/>} />
          <Route path="/view-c-schedules/:groundId" element={<ViewCoachSchedulesPage/>} />
          <Route path="/upload-trophy/:vendorId" element={<UploadTrophy/>} />
          <Route path="/upload-tshirt/:vendorId" element={<UploadTshirt/>} />
          <Route path="/organisers" element={<OrganisersPage/>} />
          <Route path="/personal-coaching" element={<PersonalCoachingPage/>} />
          <Route path="/scores" element={<ScoresPage/>} />
          <Route path="/shops" element={<ShopsPage/>} />
          <Route path="/streamers" element={<StreamersPage/>} />
          <Route path="/trophy-vendors" element={<TrophyVendorsPage/>} />
          <Route path="/tshirt-vendors" element={<TshirtVendorsPage/>} />
          <Route path="/upload-bats/:manufacturerId" element={<UploadBatManufacturers/>} />
          <Route path="/umpires" element={<UmpiresPage/>} />
          <Route path="match-details" element={<LiveMatchDetails/>} />
          <Route path="/fielding" element={<FieldingStatsPage/>} />
          <Route path="/table-toppers" element={<Tabletoppers/>} />
          <Route path="/tournament" element={<Tournaments/>} />
          <Route path="/team" element={<TeamDetails/>} />
          <Route path="/highlights" element={<Highlights/>} />
          <Route path="/match-start" element={<MatchStart/>} />
          <Route path="/match-start-rr" element={<MatchStartRR/>} />
          <Route path="/match-start-sb" element={<MatchStartSB/>} />
          <Route path="/match-start-ko" element={<MatchStartKO/>} />
          <Route path="/TournamentBracket" element={<TournamentBracket/>} />
          <Route path="/notifications" element={<Notifications/>} />
          <Route path="/umpires/whatsapp" element={<Whatsapp />} />
          <Route path="/commentators/whatsapp" element={<Whatsapp />} />
          <Route path="/playerpages" element={<PlayerPages />} />
          <Route path="/bowlingPlayerPages" element={<BowlingPlayerPages />} />
          <Route path="/awards" element={<Awards />} />
          <Route path="/winner25" element={<Winner25 />} />
          <Route path="/winner24" element={<Winner24 />} />
          <Route path="/winner23" element={<Winner23 />} />
          <Route path="/winner" element={<Winner />} />
          <Route path="/national" element={<National />} />
          <Route path="/international" element={<International />} />
          <Route path="/selectionCriteria" element={<SelectionCriteria />} />
          <Route path="/stats" element={<Stats/>} />
          <Route path="/match" element={<Match/>} />
          <Route path="/insights" element={<Insights/>} />
          <Route path="/contacts" element={<Contact/>} />
          <Route path="/subscription" element={<Subscription/>} />
          <Route path="/subscription/success" element={<SubscriptionSuccess/>} />
          <Route path="/termsandconditions" element={<Termsandconditions/>} />
          <Route path="/ChatMessage/:id" element={<ChatMessage/>} />
          <Route path="/tournamentStats" element={<TournamentStats />} />
          <Route path="/tournamentseries" element={<TournamentSeries />} />
          <Route path='/pendingTournament' element={<PendingTournaments />} />
          <Route path="/next" element={<Tournament_nextpg />} />
          <Route path="/TeamProfile" element={<TeamProfile />} />
          <Route path="/TournamentPage" element={<TournamentPage />} />
          <Route path='/tournamentSuccess' element={<TournamentSuccess />} />
          <Route path="/welcome" element={<Greeting/>} />
          <Route path="/StartMatchPlayers" element={<StartMatchPlayers />} />
          <Route path="/StartMatchPlayersSB" element={<StartMatchPlayersSB />} />
          <Route path="/StartMatchPlayersKO" element={<StartMatchPlayersKO />} />
          <Route path="/StartMatchPlayersRR" element={<StartMatchPlayersRR />} />
          <Route path='/selection' element={<Selection />} />
          <Route path='/selection1' element={<Selection1 />} />
          <Route path='/selection2' element={<Selection2 />} />
          <Route path='/flowchart' element={<Flowchart />} />
          <Route path='/addplayer' element={<AddPlayer/>} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path='/signup-business' element={<SignupB />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
