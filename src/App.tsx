import { useState } from "react";
import Login from "./components/Login";
import Register from "./components/Register";
import "./App.css";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const handleLogin = (email: string, password: string) => {
    // Here you would typically make an API call to authenticate
    console.log("Login attempt:", { email, password });

    // For demo purposes, just set logged in to true
    setIsLoggedIn(true);
  };

  const handleRegister = (userData: {
    name: string;
    email: string;
    company: string;
    role: string;
    password: string;
  }) => {
    // Here you would typically make an API call to register
    console.log("Register attempt:", userData);

    // For demo purposes, just set logged in to true after registration
    setIsLoggedIn(true);
  };

  const switchToRegister = () => {
    setIsRegistering(true);
  };

  const switchToLogin = () => {
    setIsRegistering(false);
  };

  if (!isLoggedIn) {
    if (isRegistering) {
      return (
        <Register onRegister={handleRegister} onSwitchToLogin={switchToLogin} />
      );
    } else {
      return (
        <Login onLogin={handleLogin} onSwitchToRegister={switchToRegister} />
      );
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">
            Welcome to Daily Report Shipyard
          </h1>
          <p className="text-gray-600 mb-4">You have successfully logged in!</p>
          <button
            onClick={() => setIsLoggedIn(false)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
