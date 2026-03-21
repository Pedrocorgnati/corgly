import { prisma } from '@/lib/prisma';
import type { GenerateSlotsInput } from '@/schemas/availability.schema';

export class AvailabilityService {
  async getAvailable(date: string) {
    // TODO: Implementar via /auto-flow execute
    // SELECT WHERE startAt BETWEEN date 00:00 and date+7 23:59
    // AND isBlocked = false AND session = null
    return [];
  }

  async generateSlots(data: GenerateSlotsInput) {
    // TODO: Implementar via /auto-flow execute (ADMIN only)
    // For each week (1..weeksAhead):
    //   For each day in data.days:
    //     For each range in data.ranges:
    //       Generate 50-min slots from start to end
    //       Skip if slot already exists (upsert by startAt)
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async blockSlot(slotId: string) {
    // TODO: Implementar via /auto-flow execute (ADMIN only)
    throw new Error('Not implemented - run /auto-flow execute');
  }

  async unblockSlot(slotId: string) {
    // TODO: Implementar via /auto-flow execute (ADMIN only)
    throw new Error('Not implemented - run /auto-flow execute');
  }
}

export const availabilityService = new AvailabilityService();
