//! Closing the main window while a run is working is the user's decision.
//!
//! The shell hands every close request of the main window to the renderer,
//! which knows whether a run is working and asks the user. Each request is
//! numbered and needs its own answer within [`ANSWER_BUDGET`]; without one
//! the shell exits exactly as it did before this prompt existed. A broken,
//! busy or not yet loaded renderer therefore costs at most that delay.
//!
//! What this does not bound: a renderer that acknowledges a request takes
//! over the question and keeps the window open until the user answers or
//! asks to close again. The renderer acknowledges only after its question
//! is on screen. It can confirm only the latest request of the user, and
//! not one the user withdrew.
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// How long the renderer has to answer one close request.
pub(crate) const ANSWER_BUDGET: Duration = Duration::from_millis(2000);

#[derive(Clone, Default)]
pub(crate) struct ClosePrompt {
    asked: Arc<AtomicU64>,
    answered: Arc<AtomicU64>,
    withdrawn: Arc<AtomicU64>,
}

impl ClosePrompt {
    /// A new close request of the main window. Requests are numbered from 1.
    pub(crate) fn ask(&self) -> u64 {
        self.asked.fetch_add(1, Ordering::AcqRel) + 1
    }

    /// The renderer shows its question for exactly the latest request.
    pub(crate) fn acknowledge(&self, request: u64) -> bool {
        if !self.latest(request) {
            return false;
        }
        self.answered.store(request, Ordering::Release);
        true
    }

    /// The user keeps the window open: this request can no longer close it.
    pub(crate) fn withdraw(&self, request: u64) -> bool {
        if !self.latest(request) {
            return false;
        }
        self.withdrawn.store(request, Ordering::Release);
        true
    }

    /// `request` is the latest close request the user made.
    pub(crate) fn latest(&self, request: u64) -> bool {
        request != 0 && self.asked.load(Ordering::Acquire) == request
    }

    /// The renderer may close the app for `request`: it is the user's latest
    /// close request and the user did not withdraw it.
    pub(crate) fn confirmable(&self, request: u64) -> bool {
        self.latest(request) && self.withdrawn.load(Ordering::Acquire) != request
    }

    /// Nobody answered `request` and no later request replaced it. A later
    /// request has its own deadline; the earlier one must not end the app.
    pub(crate) fn unanswered(&self, request: u64) -> bool {
        self.latest(request)
            && self.answered.load(Ordering::Acquire) != request
            && self.withdrawn.load(Ordering::Acquire) != request
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_close_request_needs_its_own_answer() {
        let prompt = ClosePrompt::default();
        let first = prompt.ask();
        assert_eq!(first, 1);
        assert!(prompt.unanswered(first));
        assert!(prompt.acknowledge(first));
        assert!(!prompt.unanswered(first));
        // The answer to the first request does not answer the second.
        let second = prompt.ask();
        assert_eq!(second, 2);
        assert!(prompt.unanswered(second));
    }

    #[test]
    fn only_the_latest_request_can_be_answered_or_confirmed() {
        let prompt = ClosePrompt::default();
        assert!(!prompt.latest(0), "no request was made yet");
        assert!(!prompt.acknowledge(0));
        assert!(!prompt.confirmable(0), "the renderer cannot close before the user asked");
        assert!(!prompt.acknowledge(1), "an answer cannot precede its request");
        assert!(!prompt.confirmable(1));
        let first = prompt.ask();
        let second = prompt.ask();
        assert!(!prompt.acknowledge(first), "a late answer to a replaced request is refused");
        assert!(!prompt.confirmable(first));
        assert!(prompt.unanswered(second), "the refused answer did not answer the latest request");
        assert!(prompt.acknowledge(second));
        assert!(prompt.confirmable(second));
        assert!(!prompt.confirmable(second + 1), "a request number cannot be guessed ahead");
    }

    #[test]
    fn a_withdrawn_request_can_no_longer_close_the_app() {
        let prompt = ClosePrompt::default();
        let first = prompt.ask();
        assert!(prompt.acknowledge(first));
        assert!(prompt.confirmable(first));
        assert!(prompt.withdraw(first), "the user keeps the window open");
        assert!(!prompt.confirmable(first), "the renderer cannot close after the user stayed");
        assert!(!prompt.unanswered(first), "a withdrawn request owns no deadline either");
        // Only a new close request of the user can close again.
        let second = prompt.ask();
        assert!(!prompt.withdraw(first), "a replaced request cannot be withdrawn any more");
        assert!(prompt.confirmable(second));
        assert!(prompt.unanswered(second));
        assert!(!prompt.withdraw(0));
    }

    #[test]
    fn a_replaced_request_never_ends_the_app_through_its_own_deadline() {
        let prompt = ClosePrompt::default();
        let first = prompt.ask();
        let second = prompt.ask();
        assert!(!prompt.unanswered(first), "only the latest request owns a deadline");
        assert!(prompt.unanswered(second));
        let shared = prompt.clone();
        assert!(shared.acknowledge(second));
        assert!(!prompt.unanswered(second), "clones share one prompt");
    }

    #[test]
    fn the_answer_budget_is_short_enough_to_feel_like_closing() {
        assert!(ANSWER_BUDGET >= Duration::from_millis(1000));
        assert!(ANSWER_BUDGET <= Duration::from_millis(3000));
    }
}
