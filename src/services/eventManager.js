const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class EventManager {
  constructor() {
    this.events = new Map();
    this.currentEventId = null;
    this.eventsFile = path.join(__dirname, '../../data/events.json');
    this.loadEvents();
    this.initializeDefaultEvents();
  }

  loadEvents() {
    try {
      if (fs.existsSync(this.eventsFile)) {
        const data = JSON.parse(fs.readFileSync(this.eventsFile, 'utf8'));
        this.currentEventId = data.currentEventId;
        data.events.forEach(eventData => {
          this.events.set(eventData.id, eventData);
        });
        logger.info(`Loaded ${this.events.size} events from storage`);
      }
    } catch (error) {
      logger.error('Failed to load events:', error);
    }
  }

  saveEvents() {
    try {
      const dir = path.dirname(this.eventsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const eventsData = {
        currentEventId: this.currentEventId,
        events: Array.from(this.events.values())
      };

      fs.writeFileSync(this.eventsFile, JSON.stringify(eventsData, null, 2));
      logger.debug('Events saved to storage');
    } catch (error) {
      logger.error('Failed to save events:', error);
    }
  }

  initializeDefaultEvents() {
    if (this.events.size === 0) {
      // AI Hackathon (completed event)
      const aiHackathon = {
        id: 'ai-hackathon-2025',
        name: 'AI Hackathon',
        description: 'The AI Hackathons goals are to build event pros real-world AI skills, foster hands-on learning and collaboration, create shareable resources and portfolio work, showcase new AI-driven event possibilities, and model effective, sustainable team processes—while addressing real-life constraints and sharing findings back to the industry.',
        date: '2025-09-24T09:00:00.000Z',
        status: 'completed',
        categories: ['tech', 'marketing', 'sponsors', 'content'],
        slackCommands: ['/hackathon', '/task', '/assistant'],
        createdAt: new Date().toISOString(),
        completedAt: '2025-09-24T18:00:00.000Z'
      };

      // New Event (upcoming)
      const newEvent = {
        id: 'new-event-2025',
        name: 'New Event',
        description: 'Fresh slate event for December 2025 with new goals and objectives.',
        date: '2025-12-31T09:00:00.000Z',
        status: 'active',
        categories: ['tech', 'marketing', 'sponsors', 'content'],
        slackCommands: ['/newevent', '/task', '/assistant'],
        createdAt: new Date().toISOString(),
        completedAt: null
      };

      this.events.set(aiHackathon.id, aiHackathon);
      this.events.set(newEvent.id, newEvent);
      this.currentEventId = newEvent.id; // Default to new event

      this.saveEvents();
      logger.info('Initialized with default events');
    }
  }

  getCurrentEvent() {
    return this.events.get(this.currentEventId);
  }

  getAllEvents() {
    return Array.from(this.events.values());
  }

  getEvent(eventId) {
    return this.events.get(eventId);
  }

  switchEvent(eventId) {
    if (!this.events.has(eventId)) {
      throw new Error(`Event not found: ${eventId}`);
    }

    const previousEventId = this.currentEventId;
    this.currentEventId = eventId;
    this.saveEvents();

    logger.info(`Switched from event ${previousEventId} to ${eventId}`);
    return this.getCurrentEvent();
  }

  createEvent(eventData) {
    const event = {
      id: eventData.id || this.generateEventId(eventData.name),
      name: eventData.name,
      description: eventData.description || '',
      date: eventData.date,
      status: eventData.status || 'active',
      categories: eventData.categories || ['tech', 'marketing', 'sponsors', 'content'],
      slackCommands: eventData.slackCommands || ['/event'],
      createdAt: new Date().toISOString(),
      completedAt: null
    };

    this.events.set(event.id, event);
    this.saveEvents();
    logger.info(`Created new event: ${event.name} (${event.id})`);
    return event;
  }

  updateEvent(eventId, updates) {
    const event = this.events.get(eventId);
    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    Object.assign(event, updates);
    event.updatedAt = new Date().toISOString();

    this.events.set(eventId, event);
    this.saveEvents();
    logger.info(`Updated event: ${eventId}`);
    return event;
  }

  deleteEvent(eventId) {
    if (eventId === this.currentEventId) {
      throw new Error('Cannot delete current active event');
    }

    const event = this.events.get(eventId);
    if (!event) {
      throw new Error(`Event not found: ${eventId}`);
    }

    this.events.delete(eventId);
    this.saveEvents();
    logger.info(`Deleted event: ${eventId}`);
    return event;
  }

  generateEventId(name) {
    const base = name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);
    return `${base}-${Date.now()}`;
  }

  getDaysUntilEvent(eventId = null) {
    const event = eventId ? this.getEvent(eventId) : this.getCurrentEvent();
    if (!event) return null;

    const now = new Date();
    const eventDate = new Date(event.date);
    const diffTime = eventDate - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isEventActive(eventId = null) {
    const event = eventId ? this.getEvent(eventId) : this.getCurrentEvent();
    return event && event.status === 'active';
  }

  getSlackCommandsForEvent(eventId = null) {
    const event = eventId ? this.getEvent(eventId) : this.getCurrentEvent();
    return event ? event.slackCommands : [];
  }
}

module.exports = new EventManager();