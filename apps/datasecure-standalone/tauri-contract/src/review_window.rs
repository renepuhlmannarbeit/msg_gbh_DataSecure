//! The native X button may defer only the session delivered to this window.
//! No delayed read of the broker's "current" session is permitted here.
#[derive(Default)]
pub struct Binding {
    generation: u64,
    review_id: Option<String>,
}

impl Binding {
    pub fn opened(&mut self) -> u64 {
        self.generation = self.generation.wrapping_add(1).max(1);
        self.review_id = None;
        self.generation
    }
    pub fn generation(&self) -> u64 { self.generation }
    pub fn delivered(&mut self, generation: u64, review_id: &str) {
        if generation != 0 && generation == self.generation {
            self.review_id = Some(review_id.to_string());
        }
    }
    pub fn accepted(&mut self, review_id: &str) {
        if self.review_id.as_deref() == Some(review_id) { self.review_id = None; }
    }
    pub fn close_snapshot(&mut self, generation: u64) -> Option<String> {
        if generation != self.generation { return None; }
        let review_id = self.review_id.take();
        self.generation = self.generation.wrapping_add(1).max(1);
        review_id
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn unloaded_window_never_defers_a_brokers_current_session() {
        let mut binding = Binding::default();
        binding.opened();
        assert_eq!(binding.close_snapshot(binding.generation()), None);
    }
    #[test]
    fn delayed_delivery_after_close_or_reopen_cannot_bind_next_window() {
        let mut binding = Binding::default();
        binding.opened();
        let old = binding.generation();
        assert_eq!(binding.close_snapshot(old), None);
        binding.opened();
        binding.delivered(old, "old");
        assert_eq!(binding.close_snapshot(binding.generation()), None);
    }
    #[test]
    fn exact_delivered_group_not_future_group_is_taken_synchronously() {
        let mut binding = Binding::default();
        binding.opened();
        let generation = binding.generation();
        binding.delivered(generation, "first");
        let deferred = binding.close_snapshot(generation);
        binding.delivered(generation, "second");
        assert_eq!(deferred.as_deref(), Some("first"));
        assert_eq!(binding.close_snapshot(binding.generation()), None);
    }
    #[test]
    fn accepted_group_is_cleared_but_next_delivered_group_can_be_deferred() {
        let mut binding = Binding::default();
        binding.opened();
        let generation = binding.generation();
        binding.delivered(generation, "first");
        binding.accepted("first");
        assert_eq!(binding.review_id, None);
        binding.delivered(generation, "second");
        binding.accepted("first");
        assert_eq!(binding.close_snapshot(generation).as_deref(), Some("second"));
    }
    #[test]
    fn old_native_close_event_cannot_defer_new_window_or_invalidate_it() {
        let mut binding = Binding::default();
        let old = binding.opened();
        let new = binding.opened();
        binding.delivered(new, "current");
        assert_eq!(binding.close_snapshot(old), None);
        assert_eq!(binding.close_snapshot(new).as_deref(), Some("current"));
    }
}
