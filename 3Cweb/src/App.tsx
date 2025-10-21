import SubmitLinks from "./pages/SubmitLinks";
import DashboardLookup from "./components/DashboardLookup";

const App = () => {
  return (
    <div style={{ padding: 16, textAlign: "center" }}>
      <h1>3C 제출링크</h1>
      {/* <SubmitLinks /> */}
      <DashboardLookup />
    </div>
  );
};

export default App;