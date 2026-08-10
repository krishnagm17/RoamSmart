import { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const iconMap = {
  success: "ti-circle-check",
  error:   "ti-alert-circle",
  info:    "ti-info-circle"
};

export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = "success", duration = 3000) => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), duration);
  }, []);

  return { toast, showToast };
}

export default function Toast({ toast }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          initial={{ opacity: 0, y: -30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <i className={`ti ${iconMap[toast.type] || iconMap.info}`} aria-hidden="true" />
          <span>{toast.message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
