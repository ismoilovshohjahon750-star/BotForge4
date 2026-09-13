import React, { createContext, useContext, useState } from 'react';

interface FeedbackContextType {
  isFeedbackOpen: boolean;
  openFeedback: (initialRating?: number, options?: { title?: string; subtitle?: string }) => void;
  closeFeedback: () => void;
  initialRating: number;
  modalTitle: string;
  modalSubtitle: string;
  feedbackUpdateTrigger: number;
  triggerFeedbackUpdate: () => void;
}

const FeedbackContext = createContext<FeedbackContextType | undefined>(undefined);

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [initialRating, setInitialRating] = useState(0);
  const [modalTitle, setModalTitle] = useState("Fikringizni qoldiring");
  const [modalSubtitle, setModalSubtitle] = useState('');
  const [feedbackUpdateTrigger, setFeedbackUpdateTrigger] = useState(0);

  const openFeedback = (
    rating: number = 0,
    options?: { title?: string; subtitle?: string }
  ) => {
    setInitialRating(rating);
    setModalTitle(options?.title || "Fikringizni qoldiring");
    setModalSubtitle(options?.subtitle || '');
    setIsFeedbackOpen(true);
  };

  const closeFeedback = () => {
    setIsFeedbackOpen(false);
  };

  const triggerFeedbackUpdate = () => {
    setFeedbackUpdateTrigger((prev) => prev + 1);
  };

  return (
    <FeedbackContext.Provider
      value={{
        isFeedbackOpen,
        openFeedback,
        closeFeedback,
        initialRating,
        modalTitle,
        modalSubtitle,
        feedbackUpdateTrigger,
        triggerFeedbackUpdate,
      }}
    >
      {children}
    </FeedbackContext.Provider>
  );
};

export const useFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
};
