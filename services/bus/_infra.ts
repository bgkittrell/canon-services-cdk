import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as events from 'aws-cdk-lib/aws-events'
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs'
import { Rule } from 'aws-cdk-lib/aws-events'
import { CloudWatchLogGroup } from 'aws-cdk-lib/aws-events-targets'

export class BusStack extends cdk.Stack {
  public readonly eventBusName: string
  constructor(scope: Construct, id: string) {
    super(scope, id)

    // Create an EventBridge event bus
    const eventBus = new events.EventBus(this, 'FileEventBus', {
      eventBusName: `${this.stackName}-FileEventBus`
    })

    const group = new LogGroup(this, 'group', {
      logGroupName: `/events/${eventBus.eventBusName}`,
      retention: RetentionDays.ONE_WEEK
    })

    new Rule(this, 'rule', {
      ruleName: 'logs',
      eventBus: eventBus,
      eventPattern: { source: [{ prefix: '' }] as any[] },
      targets: [new CloudWatchLogGroup(group)]
    })

    this.eventBusName = eventBus.eventBusName
  }
}
