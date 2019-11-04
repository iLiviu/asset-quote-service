interface EventListenerIntf {
  handleEvent(event: any): void;
}

type EventListenerFunc = (event: any) => void;

type EventListener = EventListenerIntf | EventListenerFunc;
