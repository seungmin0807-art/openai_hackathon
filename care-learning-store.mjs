import {normalizeLearningLog} from './learning-log-store.mjs';
export class CareLearningStore {
  constructor(care){this.care=care;}
  async enqueue(value){const event=normalizeLearningLog(value);const result=await this.care.recordLearningEvent(event);return{queued:true,eventId:event.eventId,duplicate:!!result?.duplicate,destinations:{guardian:{status:'pending'},clinician:{status:'pending'}}};}
  async retryPending(){return 0;}
}
