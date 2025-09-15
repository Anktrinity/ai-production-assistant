class Task {
  constructor(data = {}) {
    this.id = data.id || this.generateId();
    this.title = data.title || '';
    this.description = data.description || '';
    this.status = data.status || 'pending'; // pending, in_progress, completed, blocked
    this.priority = data.priority || 'medium'; // low, medium, high, critical
    this.assignee = data.assignee || null;
    this.dueDate = data.dueDate || null;
    this.category = data.category || 'general'; // venue, catering, tech, marketing, etc.
    this.dependencies = data.dependencies || [];
    this.estimatedHours = data.estimatedHours || 1;
    this.progress = data.progress || 0; // 0-100 percentage completion
    this.tags = data.tags || [];
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.completedAt = data.completedAt || null;
    this.notes = data.notes || [];
    this.isOnCriticalPath = data.isOnCriticalPath || false;
  }

  generateId() {
    return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  update(updates) {
    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'createdAt') {
        this[key] = updates[key];
      }
    });
    this.updatedAt = new Date().toISOString();
    
    if (updates.status === 'completed' && this.status !== 'completed') {
      this.completedAt = new Date().toISOString();
    }
  }

  addNote(note, author = 'system') {
    this.notes.push({
      id: Date.now(),
      content: note,
      author,
      timestamp: new Date().toISOString()
    });
    this.updatedAt = new Date().toISOString();
  }

  isOverdue() {
    if (!this.dueDate || this.status === 'completed') return false;
    // If task is 75% or more complete, don't consider it overdue
    if (this.progress >= 75) return false;
    return new Date(this.dueDate) < new Date();
  }

  getDaysUntilDue() {
    if (!this.dueDate) return null;
    const now = new Date();
    const due = new Date(this.dueDate);
    const diffTime = due - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isAtRisk() {
    const daysLeft = this.getDaysUntilDue();
    if (daysLeft === null) return false;
    
    // At risk if due in 2 days or less, or overdue
    return daysLeft <= 2 || this.status === 'blocked';
  }

  getUrgencyLevel() {
    if (this.isOverdue()) return 'overdue';
    if (this.isAtRisk()) return 'urgent';
    if (this.priority === 'critical') return 'critical';
    
    const daysLeft = this.getDaysUntilDue();
    if (daysLeft <= 7) return 'high';
    if (daysLeft <= 14) return 'medium';
    return 'low';
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      status: this.status,
      priority: this.priority,
      assignee: this.assignee,
      dueDate: this.dueDate,
      category: this.category,
      dependencies: this.dependencies,
      estimatedHours: this.estimatedHours,
      progress: this.progress,
      tags: this.tags,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      notes: this.notes,
      isOnCriticalPath: this.isOnCriticalPath,
      isOverdue: this.isOverdue(),
      daysUntilDue: this.getDaysUntilDue(),
      isAtRisk: this.isAtRisk(),
      urgencyLevel: this.getUrgencyLevel()
    };
  }
}

module.exports = Task;