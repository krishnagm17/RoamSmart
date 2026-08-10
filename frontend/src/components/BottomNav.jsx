export default function BottomNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: "plan",     icon: "ti-compass",      label: "Plan Trip"      },
    { id: "trips",    icon: "ti-map-2",         label: "My Trips"       },
    { id: "scan",     icon: "ti-camera",        label: "Scan Landmark"  },
    { id: "gallery",  icon: "ti-photo",         label: "Gallery"        },
    { id: "sos",      icon: "ti-alert-triangle",label: "SOS"            }
  ];

  return (
    <nav className="bottom-nav" id="bottom-nav">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          className={`bottom-nav-tab${activeTab === tab.id ? " active" : ""}`}
          onClick={() => onTabChange(tab.id)}
          type="button"
        >
          {activeTab === tab.id && <span className="tab-dot" />}
          <i className={`ti ${tab.icon}`} aria-hidden="true" />
          <span className="tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
